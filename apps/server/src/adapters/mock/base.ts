import {
  agentId,
  DEFAULT_GOALS,
  type ActionKind,
  type Agent,
  type AgentAction,
  type AgentPlatform,
  type Artifact,
  type ControlResponse,
  type LocationKind,
  type Turn,
} from '@aj/shared';
import type { AdapterContext, AgentAdapter } from '../types.ts';

export interface MockLocation {
  kind: LocationKind;
  ref: string;
  name: string;
}

export interface MockAgentSpec {
  nativeId: string;
  name: string;
  role: string;
  goal: string;
  haunts: MockLocation[];
  /** Mean minutes between autonomous turns. */
  cadenceMinutes: number;
  costPerAction: number;
}

interface MockState {
  paused: boolean;
  goal: string;
  running: boolean;
}

const VERBS: Record<LocationKind, { kind: ActionKind; text: string }[]> = {
  repo: [
    { kind: 'read', text: 'Read source files' },
    { kind: 'write', text: 'Edited files' },
    { kind: 'create', text: 'Opened a pull request' },
    { kind: 'run', text: 'Ran the test suite' },
  ],
  tool: [
    { kind: 'run', text: 'Ran a command' },
    { kind: 'query', text: 'Looked something up' },
    { kind: 'message', text: 'Posted an update' },
  ],
  board: [
    { kind: 'update', text: 'Updated items' },
    { kind: 'create', text: 'Created an item' },
  ],
  service: [{ kind: 'query', text: 'Queried metrics' }],
  brain: [{ kind: 'read', text: 'Read shared context' }],
};

/** Deterministic PRNG so history is the same every time the server boots. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export abstract class MockAdapter implements AgentAdapter {
  abstract platform: AgentPlatform;
  abstract specs: MockAgentSpec[];
  pollSeconds = 5;
  private state = new Map<string, MockState>();
  private historyTurns = 14;

  protected stateFor(spec: MockAgentSpec): MockState {
    let s = this.state.get(spec.nativeId);
    if (!s) {
      s = { paused: false, goal: spec.goal, running: false };
      this.state.set(spec.nativeId, s);
    }
    return s;
  }

  async listAgents(): Promise<Agent[]> {
    return this.specs.map((spec) => {
      const s = this.stateFor(spec);
      return {
        id: agentId(this.platform, spec.nativeId),
        platform: this.platform,
        nativeId: spec.nativeId,
        name: spec.name,
        role: `${spec.role} (mock)`,
        status: s.paused ? 'paused' : s.running ? 'running' : 'idle',
        goal: s.goal,
        capabilities: { pause: true, resume: true, assignGoal: true, triggerTurn: true, perJob: false },
        goals: DEFAULT_GOALS,
      };
    });
  }

  async syncTurns(agent: Agent, ctx: AdapterContext): Promise<Turn[]> {
    const spec = this.specFor(agent);
    const known = ctx.knownTurns(agent.id);
    const now = Date.now();

    if (known.length === 0) {
      // Backfill a deterministic history whose last turn starts half a cadence ago.
      const rnd = mulberry32(hash(agent.id));
      const gaps = Array.from({ length: this.historyTurns - 1 }, () => spec.cadenceMinutes * 60_000 * (0.6 + rnd() * 0.8));
      let t = now - spec.cadenceMinutes * 30_000 - gaps.reduce((sum, g) => sum + g, 0);
      const turns: Turn[] = [];
      for (let i = 0; i < this.historyTurns; i++) {
        turns.push(this.makeTurn(agent, spec, ctx, i, t, rnd, 'schedule'));
        t += gaps[i] ?? 0;
      }
      return turns;
    }

    const last = known[known.length - 1]!;
    const s = this.stateFor(spec);
    const lastEnd = Date.parse(last.endedAt ?? last.startedAt);
    if (last.status === 'running') {
      if (now < lastEnd) return [];
      s.running = false;
      const failed = last.actions.some((a) => !a.success);
      return [{ ...last, status: failed ? 'failed' : 'succeeded' }];
    }
    s.running = false;
    // Live play: compress cadence so the board moves while you watch.
    const liveGapMs = (20 + (hash(last.id) % 25)) * 1000;
    if (!s.paused && now - lastEnd > liveGapMs) {
      s.running = true;
      const rnd = mulberry32(hash(`${agent.id}:${known.length}`));
      return [this.makeTurn(agent, spec, ctx, known.length, now - 4_000, rnd, 'schedule')];
    }
    return [];
  }

  async pause(agent: Agent): Promise<ControlResponse> {
    this.stateFor(this.specFor(agent)).paused = true;
    return { ok: true, message: `${agent.name} paused` };
  }

  async resume(agent: Agent): Promise<ControlResponse> {
    this.stateFor(this.specFor(agent)).paused = false;
    return { ok: true, message: `${agent.name} resumed` };
  }

  async assignGoal(agent: Agent, text: string): Promise<ControlResponse> {
    this.stateFor(this.specFor(agent)).goal = text;
    return { ok: true, message: `New goal set for ${agent.name}` };
  }

  async triggerTurn(agent: Agent, ctx: AdapterContext, message?: string): Promise<ControlResponse> {
    const spec = this.specFor(agent);
    const index = ctx.knownTurns(agent.id).length;
    const rnd = mulberry32(hash(`${agent.id}:manual:${Date.now()}`));
    const turn = this.makeTurn(agent, spec, ctx, index, Date.now(), rnd, message ? `manual: ${message}` : 'manual');
    this.stateFor(spec).running = true;
    ctx.emitTurn(turn);
    return { ok: true, message: `Turn ${index + 1} started for ${agent.name}`, runRef: turn.id };
  }

  private specFor(agent: Agent) {
    const spec = this.specs.find((s) => s.nativeId === agent.nativeId);
    if (!spec) throw new Error(`Unknown mock agent ${agent.id}`);
    return spec;
  }

  private makeTurn(
    agent: Agent,
    spec: MockAgentSpec,
    ctx: AdapterContext,
    index: number,
    start: number,
    rnd: () => number,
    trigger: string,
  ): Turn {
    const turnId = `${agent.id}:mock-${index}-${start}`;
    const actionCount = 3 + Math.floor(rnd() * 5);
    const actions: AgentAction[] = [];
    let t = start;
    const failed = rnd() < 0.12;

    for (let i = 0; i < actionCount; i++) {
      // No Team Brain visits until the brain is real; mocks shouldn't claim context they never read.
      const haunt = spec.haunts[Math.floor(rnd() * spec.haunts.length)]!;
      const location = ctx.locations.ensure(haunt.kind, haunt.ref, haunt.name);
      const verbs = VERBS[haunt.kind];
      const verb = verbs[Math.floor(rnd() * verbs.length)]!;
      const durationMs = Math.round(800 + rnd() * 2400);
      const isLast = i === actionCount - 1;
      const artifacts: Artifact[] =
        verb.kind === 'create' && haunt.kind === 'repo'
          ? [{ kind: 'pr', title: `${spec.name}: ${verb.text.toLowerCase()} #${100 + index}` }]
          : verb.kind === 'create'
            ? [{ kind: 'item', title: `New item from turn ${index + 1}` }]
            : [];
      actions.push({
        id: `${turnId}:${i}`,
        turnId,
        locationId: location.id,
        kind: verb.kind,
        summary: `${verb.text} in ${location.name}`,
        startedAt: new Date(t).toISOString(),
        durationMs,
        cost: Math.round(spec.costPerAction * (0.5 + rnd()) * 100) / 100,
        success: !(failed && isLast),
        brainReads: 0,
        artifacts,
      });
      t += durationMs;
    }

    return {
      id: turnId,
      agentId: agent.id,
      index,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(t).toISOString(),
      // A live turn is still playing out until its last action ends; the next sync settles it.
      status: t > Date.now() ? 'running' : failed ? 'failed' : 'succeeded',
      trigger,
      source: 'mock',
      actions,
    };
  }
}
