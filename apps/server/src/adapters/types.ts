import type { Agent, AgentPlatform, ControlResponse, Turn } from '@aj/shared';
import type { LocationRegistry } from '../locations/registry.ts';

export interface AdapterContext {
  locations: LocationRegistry;
  /** Turns already stored for an agent, used to keep indexes stable and to refresh open turns. */
  knownTurns(agentId: string): Turn[];
  /** Stores a turn the adapter created outside a sync (e.g. right after a trigger). */
  emitTurn(turn: Turn): void;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface AgentAdapter {
  platform: AgentPlatform;
  /** Seconds between syncs. */
  pollSeconds: number;
  init?(ctx: AdapterContext): Promise<void>;
  listAgents(ctx: AdapterContext): Promise<Agent[]>;
  /** Returns new or changed turns since `since`. Upserted by id, so re-returning a turn is fine. */
  syncTurns(agent: Agent, ctx: AdapterContext, since?: Date): Promise<Turn[]>;
  pause?(agent: Agent): Promise<ControlResponse>;
  resume?(agent: Agent): Promise<ControlResponse>;
  assignGoal?(agent: Agent, text: string, jobId?: string): Promise<ControlResponse>;
  triggerTurn?(agent: Agent, ctx: AdapterContext, message?: string, jobId?: string): Promise<ControlResponse>;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
