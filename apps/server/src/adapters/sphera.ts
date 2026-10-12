import {
  agentId,
  DEFAULT_GOALS,
  type Agent,
  type AgentAction,
  type ControlResponse,
  type Turn,
} from '@aj/shared';
import type { Config } from '../config.ts';
import { AdapterError, type AdapterContext, type AgentAdapter } from './types.ts';

interface RawSpheraAgent {
  id: number | string;
  name?: string;
  description?: string;
  prompt?: string;
  enabled?: boolean;
  contextRepositories?: string[];
  editPermissions?: Record<string, { access?: string }>;
}

interface PendingRun {
  turnId: string;
  executionUuid: string;
  startedAt: string;
  repos: string[];
}

/** Undocumented history endpoints we try at startup. The first that answers wins. */
const HISTORY_CANDIDATES = (id: string) => [`/agents/${id}/executions`, `/agents/${id}/runs`];
const RUN_WINDOW_MS = 60 * 60_000;
const TIMEOUT_MS = 15_000;
const PENDING_KEY = (id: string) => `sphera:pending:${id}`;

export class SpheraAdapter implements AgentAdapter {
  platform = 'sphera' as const;
  pollSeconds: number;
  private historyPath = new Map<string, string | null>();
  private repos = new Map<string, string[]>();

  constructor(
    private cfg: Config['sphera'],
    private kv: { getKv<T>(key: string): T | undefined; setKv(key: string, value: unknown): void },
  ) {
    this.pollSeconds = cfg.pollSeconds;
  }

  async init(ctx: AdapterContext) {
    for (const id of this.cfg.agentIds) {
      const found = await this.probeHistory(id);
      this.historyPath.set(id, found);
      ctx.log('sphera history probe', { agent: id, endpoint: found ?? 'none (using triggered runs + GitHub)' });
    }
  }

  async probeHistory(id: string): Promise<string | null> {
    for (const path of HISTORY_CANDIDATES(id)) {
      try {
        const res = await this.request(path);
        if (res.ok && Array.isArray(await res.json())) return path;
      } catch {
        // Not available; try the next candidate.
      }
    }
    return null;
  }

  async listAgents(ctx: AdapterContext): Promise<Agent[]> {
    const agents: Agent[] = [];
    for (const nativeId of this.cfg.agentIds) {
      const id = agentId('sphera', nativeId);
      try {
        const raw = (await (await this.ok(this.request(`/agents/${nativeId}`))).json()) as RawSpheraAgent;
        const repos = raw.contextRepositories ?? [];
        this.repos.set(nativeId, repos);
        for (const repo of repos) ctx.locations.ensure('repo', repo, repo, `https://github.com/${repo}`);
        const hasOpenTurn = ctx.knownTurns(id).some((t) => t.status === 'pending' || t.status === 'running');
        const instructionsLocked = raw.editPermissions?.instructions?.access === 'only_me';
        agents.push({
          id,
          platform: 'sphera',
          nativeId,
          name: raw.name ?? `Sphera agent ${nativeId}`,
          role: raw.description,
          status: raw.enabled === false ? 'paused' : hasOpenTurn ? 'running' : 'idle',
          goal: raw.prompt,
          capabilities: {
            pause: true,
            resume: true,
            // Owner-only prompts need a session cookie; without it the goal goes in as a run message.
            assignGoal: !instructionsLocked || Boolean(this.cfg.sessionCookie),
            triggerTurn: true,
            perJob: false,
          },
          goals: DEFAULT_GOALS,
          url: this.cfg.uiUrl ? `${this.cfg.uiUrl}/${nativeId}` : undefined,
        });
      } catch (err) {
        agents.push({
          id,
          platform: 'sphera',
          nativeId,
          name: `Sphera agent ${nativeId}`,
          status: 'unknown',
          capabilities: { pause: false, resume: false, assignGoal: false, triggerTurn: false, perJob: false },
          goals: DEFAULT_GOALS,
          syncError: `${String(err)} (on VPN?)`,
        });
      }
    }
    return agents;
  }

  async syncTurns(agent: Agent, ctx: AdapterContext): Promise<Turn[]> {
    const historyPath = this.historyPath.get(agent.nativeId);
    if (historyPath) return this.nativeTurns(agent, historyPath, ctx);
    return this.triggeredTurns(agent, ctx);
  }

  async pause(agent: Agent): Promise<ControlResponse> {
    await this.ok(this.request(`/agents/${agent.nativeId}`, 'PATCH', { enabled: false }));
    return { ok: true, message: `${agent.name} disabled` };
  }

  async resume(agent: Agent): Promise<ControlResponse> {
    await this.ok(this.request(`/agents/${agent.nativeId}`, 'PATCH', { enabled: true }));
    return { ok: true, message: `${agent.name} enabled` };
  }

  async assignGoal(agent: Agent, text: string): Promise<ControlResponse> {
    const res = await this.request(`/agents/${agent.nativeId}`, 'PATCH', { prompt: text }, true);
    if (res.status === 403) {
      throw new AdapterError('Sphera says this prompt is owner-only. Set SPHERA_SESSION_COOKIE or edit it in Sphera.', 403);
    }
    await this.ok(Promise.resolve(res));
    return { ok: true, message: `Prompt updated for ${agent.name}` };
  }

  async triggerTurn(agent: Agent, ctx: AdapterContext, message?: string): Promise<ControlResponse> {
    const repos = this.repos.get(agent.nativeId) ?? [];
    const res = await this.ok(
      this.request(`/agents/${agent.nativeId}/trigger`, 'POST', {
        contextRepositories: repos,
        ...(message ? { message } : {}),
      }),
    );
    const body = (await res.json()) as { executionUuid?: string };
    if (!body.executionUuid) return { ok: true, message: 'Run accepted, but Sphera returned no execution id' };

    const run: PendingRun = {
      turnId: `${agent.id}:exec-${body.executionUuid}`,
      executionUuid: body.executionUuid,
      startedAt: new Date().toISOString(),
      repos,
    };
    this.kv.setKv(PENDING_KEY(agent.id), [...(this.kv.getKv<PendingRun[]>(PENDING_KEY(agent.id)) ?? []), run]);
    ctx.emitTurn({
      id: run.turnId,
      agentId: agent.id,
      index: ctx.knownTurns(agent.id).length,
      startedAt: run.startedAt,
      status: 'pending',
      trigger: message ? `ui: ${message}` : 'ui',
      source: 'github',
      actions: [],
    });
    return { ok: true, message: `Run started for ${agent.name}`, runRef: body.executionUuid };
  }

  /** Maps whatever the discovered history endpoint returns. Field names are guessed defensively. */
  private async nativeTurns(agent: Agent, path: string, ctx: AdapterContext): Promise<Turn[]> {
    const rows = (await (await this.ok(this.request(path))).json()) as Record<string, unknown>[];
    const known = ctx.knownTurns(agent.id);
    return rows.map((row, i) => {
      const runId = String(row.executionUuid ?? row.uuid ?? row.id ?? i);
      const turnId = `${agent.id}:exec-${runId}`;
      const startedAt = String(row.startedAt ?? row.createdAt ?? row.created_at ?? new Date().toISOString());
      const status = String(row.status ?? '').toLowerCase();
      return {
        id: turnId,
        agentId: agent.id,
        index: known.find((t) => t.id === turnId)?.index ?? i,
        startedAt,
        endedAt: (row.endedAt ?? row.finishedAt ?? row.completedAt) as string | undefined,
        status: status.includes('fail') ? 'failed' : status.includes('run') || status.includes('pend') ? 'running' : 'succeeded',
        trigger: String(row.trigger ?? row.triggerType ?? 'sphera'),
        source: 'native',
        actions: [],
      } satisfies Turn;
    });
  }

  /** Runs we triggered, filled in with GitHub activity in the context repos during the run window. */
  private async triggeredTurns(agent: Agent, ctx: AdapterContext): Promise<Turn[]> {
    const pending = this.kv.getKv<PendingRun[]>(PENDING_KEY(agent.id)) ?? [];
    const turns: Turn[] = [];
    const stillOpen: PendingRun[] = [];
    for (const run of pending) {
      const started = Date.parse(run.startedAt);
      const actions = await this.githubActions(run, ctx);
      const windowClosed = Date.now() - started > RUN_WINDOW_MS;
      turns.push({
        id: run.turnId,
        agentId: agent.id,
        index: ctx.knownTurns(agent.id).find((t) => t.id === run.turnId)?.index ?? ctx.knownTurns(agent.id).length,
        startedAt: run.startedAt,
        endedAt: windowClosed ? new Date(started + RUN_WINDOW_MS).toISOString() : undefined,
        status: windowClosed ? 'succeeded' : actions.length ? 'running' : 'pending',
        trigger: 'ui',
        source: 'github',
        actions,
      });
      if (!windowClosed) stillOpen.push(run);
    }
    this.kv.setKv(PENDING_KEY(agent.id), stillOpen);
    return turns;
  }

  private async githubActions(run: PendingRun, ctx: AdapterContext): Promise<AgentAction[]> {
    if (!this.cfg.githubToken || !this.cfg.githubActor) return [];
    const since = Date.parse(run.startedAt);
    const until = since + RUN_WINDOW_MS;
    const actions: AgentAction[] = [];
    for (const repo of run.repos) {
      const res = await fetch(`https://api.github.com/repos/${repo}/events?per_page=100`, {
        headers: { Authorization: `Bearer ${this.cfg.githubToken}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const events = (await res.json()) as {
        id: string;
        type: string;
        actor: { login: string };
        created_at: string;
        payload: { pull_request?: { title: string; html_url: string }; commits?: unknown[]; action?: string };
      }[];
      const loc = ctx.locations.ensure('repo', repo, repo, `https://github.com/${repo}`);
      for (const ev of events) {
        const at = Date.parse(ev.created_at);
        if (ev.actor.login !== this.cfg.githubActor || at < since || at > until) continue;
        const pr = ev.payload.pull_request;
        actions.push({
          id: `${run.turnId}:${ev.id}`,
          turnId: run.turnId,
          locationId: loc.id,
          kind: ev.type === 'PushEvent' ? 'write' : ev.type.includes('Comment') ? 'comment' : 'create',
          summary: pr ? `${ev.payload.action ?? 'touched'} PR "${pr.title}"` : ev.type.replace('Event', ''),
          startedAt: ev.created_at,
          durationMs: 1_000,
          cost: 0,
          success: true,
          brainReads: 0,
          artifacts: pr ? [{ kind: 'pr', title: pr.title, url: pr.html_url }] : [],
        });
      }
    }
    return actions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  private request(path: string, method = 'GET', body?: unknown, withCookie = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withCookie && this.cfg.sessionCookie) headers.Cookie = this.cfg.sessionCookie;
    return fetch(`${this.cfg.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async ok(p: Promise<Response>) {
    const res = await p;
    if (!res.ok) throw new AdapterError(`Sphera returned ${res.status}`, res.status === 403 ? 403 : 502);
    return res;
  }
}
