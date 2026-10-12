import {
  agentId,
  DEFAULT_GOALS,
  type Agent,
  type AgentAction,
  type AgentJob,
  type AgentStatus,
  type ControlResponse,
  type Turn,
  type TurnStatus,
} from '@aj/shared';
import type { Config } from '../../config.ts';
import { AdapterError, type AdapterContext, type AgentAdapter } from '../types.ts';
import { MondayGraphql, MondayMcp } from './client.ts';
import { boardIdCandidates } from './boards.ts';
import { annotateWithJob, type ScheduledJob } from './jobs.ts';
import { groupIntoTurns, parseActivityTimestamp, type ActivityEvent } from './turns.ts';

interface RawAgent {
  id: string;
  kind?: string;
  state?: string;
  goal?: string;
  /** Agent-level instructions. Some agents keep all their work here and leave jobs empty. */
  identity?: string;
  plan?: string;
  profile?: { name?: string; role?: string; avatar_url?: string };
}

interface RawJob extends ScheduledJob {
  job_id: string;
  enabled: boolean;
}

interface AgentMeta {
  userId?: string;
  ownerId?: string;
  personal: boolean;
  boardIds: string[];
  jobs: RawJob[];
}

interface PendingRun {
  turnId: string;
  triggerUuid: string;
  startedAt: string;
  jobName?: string;
}

const BACKFILL_DAYS = 14;
/** Bump when inferred-turn logic changes, so stored history is rebuilt once. */
const INFERENCE_VERSION = 4;
const INFERENCE_KEY = (id: string) => `monday:inference-version:${id}`;
const PENDING_KEY = (id: string) => `monday:pending:${id}`;

export class MondayAdapter implements AgentAdapter {
  platform = 'monday' as const;
  pollSeconds: number;
  private gql: MondayGraphql;
  private mcp: MondayMcp;
  private meta = new Map<string, AgentMeta>();
  private meId?: string;
  private pending = new Map<string, PendingRun[]>();
  private boardCache = new Map<string, string[]>();

  constructor(
    private cfg: Config['monday'],
    private kv: { getKv<T>(key: string): T | undefined; setKv(key: string, value: unknown): void },
  ) {
    this.pollSeconds = cfg.pollSeconds;
    this.gql = new MondayGraphql(cfg.apiUrl, cfg.token);
    this.mcp = new MondayMcp(cfg.mcpUrl, cfg.token);
  }

  async init(ctx: AdapterContext) {
    const { me } = await this.gql.query<{ me: { id: string } }>('query { me { id } }');
    this.meId = me.id;
    ctx.log('monday connected', { userId: me.id, agents: this.cfg.agentIds });
  }

  async listAgents(ctx: AdapterContext): Promise<Agent[]> {
    const agents: Agent[] = [];
    for (const nativeId of this.cfg.agentIds) {
      const id = agentId('monday', nativeId);
      try {
        const raw = pickAgent(await this.mcp.call<unknown>('manage_agent', { action: 'get', agent_id: nativeId }));
        const jobsRes = await this.mcp.call<{ jobs?: RawJob[] }>('manage_agent_jobs', {
          action: 'list',
          agent_id: nativeId,
        });
        const jobs: AgentJob[] = (jobsRes.jobs ?? []).map((j) => ({
          id: j.job_id,
          name: jobLabel(j),
          enabled: j.enabled,
          instructions: j.instructions,
        }));
        const meta = await this.resolveMeta(nativeId, raw, jobsRes.jobs ?? [], ctx);
        const hasOpenTurn = ctx.knownTurns(id).some((t) => t.status === 'running' || t.status === 'pending');
        agents.push({
          id,
          platform: 'monday',
          nativeId,
          name: raw.profile?.name ?? `monday agent ${nativeId}`,
          role: raw.profile?.role,
          avatarUrl: raw.profile?.avatar_url,
          status: mapState(raw.state, hasOpenTurn),
          goal: raw.goal,
          jobs,
          capabilities: { pause: true, resume: true, assignGoal: true, triggerTurn: true, perJob: true },
          goals: DEFAULT_GOALS,
          url: meta.userId && this.cfg.accountUrl ? `${this.cfg.accountUrl}/ai_agents/user/${meta.userId}/editor` : undefined,
        });
      } catch (err) {
        ctx.log('monday agent fetch failed', { agent: nativeId, err: String(err) });
        agents.push(offlineAgent(id, nativeId, String(err)));
      }
    }
    return agents;
  }

  async syncTurns(agent: Agent, ctx: AdapterContext): Promise<Turn[]> {
    const meta = this.meta.get(agent.nativeId);
    if (!meta) return [];
    const [inferred, triggered] = await Promise.all([
      this.activityTurns(agent, meta, ctx),
      this.triggeredTurns(agent, ctx),
    ]);
    return [...inferred, ...triggered];
  }

  async pause(agent: Agent): Promise<ControlResponse> {
    await this.mcp.call('manage_agent', { action: 'deactivate', agent_id: agent.nativeId });
    return { ok: true, message: `${agent.name} deactivated` };
  }

  async resume(agent: Agent): Promise<ControlResponse> {
    await this.mcp.call('manage_agent', { action: 'activate', agent_id: agent.nativeId });
    return { ok: true, message: `${agent.name} activated` };
  }

  async assignGoal(agent: Agent, text: string, jobId?: string): Promise<ControlResponse> {
    if (!jobId) throw new AdapterError('Pick a job: monday goals are set per job', 400);
    await this.mcp.call('manage_agent_jobs', {
      action: 'update',
      agent_id: agent.nativeId,
      job_id: jobId,
      instructions: text,
    });
    const job = agent.jobs?.find((j) => j.id === jobId);
    return { ok: true, message: `Updated instructions for ${job?.name ?? 'job'}` };
  }

  async triggerTurn(agent: Agent, ctx: AdapterContext, _message?: string, jobId?: string): Promise<ControlResponse> {
    const res = jobId
      ? await this.mcp.call<unknown>('manage_agent_jobs', { action: 'run', agent_id: agent.nativeId, job_id: jobId })
      : await this.mcp.call<unknown>('manage_agent', { action: 'run', agent_id: agent.nativeId });
    const triggerUuid = findKey(res, 'trigger_uuid');
    if (!triggerUuid) return { ok: true, message: 'Run accepted, but monday returned no trigger id to track' };

    const jobName = agent.jobs?.find((j) => j.id === jobId)?.name;
    const run: PendingRun = {
      turnId: `${agent.id}:trg-${triggerUuid}`,
      triggerUuid,
      startedAt: new Date().toISOString(),
      jobName,
    };
    this.savePending(agent.id, [...this.loadPending(agent.id), run]);
    ctx.emitTurn({
      id: run.turnId,
      agentId: agent.id,
      index: ctx.knownTurns(agent.id).length,
      startedAt: run.startedAt,
      status: 'pending',
      trigger: 'ui',
      jobName,
      source: 'tool-events',
      actions: [],
    });
    return { ok: true, message: `Run started${jobName ? ` for ${jobName}` : ''}`, runRef: triggerUuid };
  }

  /** History: board activity attributed to the agent (or, for personal agents, its owner). */
  private async activityTurns(agent: Agent, meta: AgentMeta, ctx: AdapterContext): Promise<Turn[]> {
    const actorIds = [meta.userId, meta.personal ? (meta.ownerId ?? this.meId) : undefined].filter(
      (v): v is string => Boolean(v),
    );
    if (!meta.boardIds.length || !actorIds.length) return [];

    const rebuild = this.kv.getKv<number>(INFERENCE_KEY(agent.id)) !== INFERENCE_VERSION;
    const known = ctx.knownTurns(agent.id).filter((t) => t.source === 'activity-log');
    const lastInferred = rebuild ? undefined : known[known.length - 1];
    const from = lastInferred
      ? new Date(Date.parse(lastInferred.startedAt))
      : new Date(Date.now() - BACKFILL_DAYS * 86_400_000);

    const data = await this.gql.query<{
      boards: {
        id: string;
        name: string;
        activity_logs: { id: string; event: string; created_at: string; user_id: string; data: string }[];
      }[];
    }>(
      `query($ids:[ID!], $uids:[ID!], $from: ISO8601DateTime) {
        boards(ids: $ids) { id name activity_logs(user_ids: $uids, from: $from, limit: 500) { id event created_at user_id data } }
      }`,
      { ids: meta.boardIds, uids: actorIds, from: from.toISOString() },
    );

    const events: ActivityEvent[] = [];
    for (const board of data.boards) {
      // A board only becomes a building once the agent actually did something there.
      if (!board.activity_logs.length) continue;
      const loc = ctx.locations.ensure('board', board.id, board.name, this.boardUrl(board.id));
      for (const log of board.activity_logs) {
        events.push({
          id: log.id,
          event: log.event,
          at: parseActivityTimestamp(log.created_at),
          boardId: board.id,
          locationId: loc.id,
          data: safeJson(log.data),
        });
      }
    }
    this.kv.setKv(INFERENCE_KEY(agent.id), INFERENCE_VERSION);
    if (!events.length) return [];

    const priorCount = lastInferred ? lastInferred.index : rebuild ? 0 : ctx.knownTurns(agent.id).length;
    const ensureTool = (ref: string, name: string) => ctx.locations.ensure('tool', ref, name).id;
    return groupIntoTurns(agent.id, events, priorCount, Date.now(), this.cfg.accountUrl).map((turn) =>
      annotateWithJob(turn, meta.jobs, ensureTool),
    );
  }

  /** Runs started from this UI: exact tool calls from tool_events, status from trigger_event. */
  private async triggeredTurns(agent: Agent, ctx: AdapterContext): Promise<Turn[]> {
    const pending = this.loadPending(agent.id);
    if (!pending.length) return [];
    const turns: Turn[] = [];
    const stillOpen: PendingRun[] = [];

    for (const run of pending) {
      const existing = ctx.knownTurns(agent.id).find((t) => t.id === run.turnId);
      const data = await this.gql.query<{
        trigger_event: { eventState?: string; triggerDuration?: number; errorReason?: string } | null;
        tool_events: {
          tool_events: {
            id: string;
            tool_name?: string;
            mcp_server?: string;
            event_status?: string;
            error_message?: string;
            tool_start_timestamp?: number;
            execution_duration_ms?: number;
          }[];
        } | null;
      }>(
        `query($u: String!) {
          trigger_event(triggerUuid: $u) { eventState triggerDuration errorReason }
          tool_events(trigger_uuid: $u) { tool_events { id tool_name mcp_server event_status error_message tool_start_timestamp execution_duration_ms } }
        }`,
        { u: run.triggerUuid },
      );

      const actions: AgentAction[] = (data.tool_events?.tool_events ?? []).map((te, i) => {
        const server = te.mcp_server || 'monday';
        const loc = ctx.locations.ensure('tool', server, server);
        const startedMs = te.tool_start_timestamp ? toMs(te.tool_start_timestamp) : Date.parse(run.startedAt) + i;
        return {
          id: `${run.turnId}:${te.id}`,
          turnId: run.turnId,
          locationId: loc.id,
          kind: 'run',
          summary: te.error_message ? `${te.tool_name} failed: ${te.error_message}` : `Called ${te.tool_name}`,
          startedAt: new Date(startedMs).toISOString(),
          durationMs: te.execution_duration_ms ?? 0,
          cost: 0,
          success: !te.error_message && te.event_status !== 'failed',
          brainReads: 0,
          artifacts: [],
        };
      });

      const status = mapTriggerState(data.trigger_event?.eventState);
      const last = actions[actions.length - 1];
      turns.push({
        id: run.turnId,
        agentId: agent.id,
        index: existing?.index ?? ctx.knownTurns(agent.id).length,
        startedAt: run.startedAt,
        endedAt:
          status === 'succeeded' || status === 'failed'
            ? last
              ? new Date(Date.parse(last.startedAt) + last.durationMs).toISOString()
              : new Date().toISOString()
            : undefined,
        status,
        trigger: 'ui',
        jobName: run.jobName,
        source: 'tool-events',
        actions,
      });
      if (status === 'pending' || status === 'running') stillOpen.push(run);
    }

    this.savePending(agent.id, stillOpen);
    return turns;
  }

  private async resolveMeta(nativeId: string, raw: RawAgent, jobs: RawJob[], ctx: AdapterContext) {
    const cached = this.meta.get(nativeId);
    const agentInstructions = raw.identity || raw.plan;
    const boardIds = await this.confirmBoards(
      boardIdCandidates(agentInstructions, ...jobs.map((j) => j.instructions)),
    );

    let userId = cached?.userId;
    if (!userId) {
      // Agent users follow agent-{agentId}@agent.monday.com.
      const { users } = await this.gql.query<{ users: { id: string }[] }>(
        'query($e:[String!]) { users(emails: $e) { id } }',
        { e: [`agent-${nativeId}@agent.monday.com`] },
      );
      userId = users[0]?.id;
    }

    const meta: AgentMeta = {
      userId,
      ownerId: this.meId,
      personal: raw.kind === 'PERSONAL',
      boardIds,
      // Jobs without their own instructions run on the agent's, so infer tools from those.
      jobs: jobs.map((j) => ({ ...j, name: jobLabel(j), instructions: j.instructions || agentInstructions })),
    };
    this.meta.set(nativeId, meta);
    if (!cached || cached.boardIds.join() !== boardIds.join()) ctx.log('monday agent resolved', { agent: nativeId, userId, personal: meta.personal, boardIds: meta.boardIds });
    return meta;
  }

  /** Keeps only candidates that are real boards. Cached, since instructions rarely change. */
  private async confirmBoards(candidates: string[]): Promise<string[]> {
    if (!candidates.length) return [];
    const key = [...candidates].sort().join(',');
    const hit = this.boardCache.get(key);
    if (hit) return hit;
    const { boards } = await this.gql.query<{ boards: { id: string }[] }>(
      'query($ids:[ID!]) { boards(ids: $ids, limit: 100) { id } }',
      { ids: candidates },
    );
    const confirmed = candidates.filter((id) => boards.some((b) => b.id === id));
    this.boardCache.set(key, confirmed);
    return confirmed;
  }

  private boardUrl(boardId: string) {
    return this.cfg.accountUrl ? `${this.cfg.accountUrl}/boards/${boardId}` : undefined;
  }

  private loadPending(agentKey: string): PendingRun[] {
    let runs = this.pending.get(agentKey);
    if (!runs) {
      runs = this.kv.getKv<PendingRun[]>(PENDING_KEY(agentKey)) ?? [];
      this.pending.set(agentKey, runs);
    }
    return runs;
  }

  private savePending(agentKey: string, runs: PendingRun[]) {
    this.pending.set(agentKey, runs);
    this.kv.setKv(PENDING_KEY(agentKey), runs);
  }
}

/** Some jobs are created without a name. */
function jobLabel(job: { name?: string }) {
  return job.name?.trim() || 'Scheduled run';
}

function pickAgent(res: unknown): RawAgent {
  const r = res as { agent?: RawAgent; agents?: RawAgent[]; data?: RawAgent } & RawAgent;
  const agent = r.agent ?? r.agents?.[0] ?? r.data ?? (r.id ? r : undefined);
  if (!agent) throw new AdapterError('monday agent not found or not accessible');
  return agent;
}

function mapState(state: string | undefined, hasOpenTurn: boolean): AgentStatus {
  switch (state) {
    case 'ACTIVE':
      return hasOpenTurn ? 'running' : 'idle';
    case 'INACTIVE':
    case 'ARCHIVED':
      return 'paused';
    case 'FAILED':
      return 'failed';
    default:
      return 'unknown';
  }
}

export function mapTriggerState(state: string | undefined): TurnStatus {
  if (!state) return 'pending';
  const s = state.toLowerCase();
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('success') || s.includes('finished') || s === 'done' || s === 'completed') return 'succeeded';
  return 'running';
}

function offlineAgent(id: string, nativeId: string, error: string): Agent {
  return {
    id,
    platform: 'monday',
    nativeId,
    name: `monday agent ${nativeId}`,
    status: 'unknown',
    capabilities: { pause: false, resume: false, assignGoal: false, triggerTurn: false, perJob: true },
    goals: DEFAULT_GOALS,
    syncError: error,
  };
}

function findKey(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k === key && typeof v === 'string') return v;
    const nested = findKey(v, key);
    if (nested) return nested;
  }
  return undefined;
}

/** tool_start_timestamp may be seconds or milliseconds. */
const toMs = (ts: number) => (ts < 1e12 ? ts * 1000 : ts);

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

