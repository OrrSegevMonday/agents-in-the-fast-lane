import type { Agent, Turn } from '@aj/shared';
import type { AdapterContext, AgentAdapter } from './adapters/types.ts';
import { bus } from './bus.ts';
import type { LocationRegistry } from './locations/registry.ts';
import type { Store } from './store/sqlite.ts';

/** Runs each adapter on its own interval and pushes whatever changed to the store and the stream. */
export class Poller {
  private timers: NodeJS.Timeout[] = [];
  private busy = new Set<string>();
  /** Agents the enabled adapters reported this run. Older ones stay in the store but aren't served. */
  private activeIds = new Set<string>();
  readonly ctx: AdapterContext;

  constructor(
    private adapters: AgentAdapter[],
    private store: Store,
    locations: LocationRegistry,
    private log: AdapterContext['log'],
  ) {
    this.ctx = {
      locations,
      knownTurns: (agentId) => this.store.listTurns(agentId),
      emitTurn: (turn) => this.saveTurn(turn),
      log,
    };
  }

  async start() {
    for (const adapter of this.adapters) {
      try {
        await adapter.init?.(this.ctx);
      } catch (err) {
        this.log(`${adapter.platform} init failed`, { err: String(err) });
      }
      void this.tick(adapter);
      this.timers.push(setInterval(() => void this.tick(adapter), adapter.pollSeconds * 1000));
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
  }

  isActive(agentId: string) {
    return this.activeIds.has(agentId);
  }

  adapterFor(agent: Agent) {
    return this.adapters.find((a) => a.platform === agent.platform);
  }

  /** Re-sync one adapter now, e.g. right after a control action. */
  async refresh(agent: Agent) {
    const adapter = this.adapterFor(agent);
    if (adapter) await this.tick(adapter);
  }

  private async tick(adapter: AgentAdapter) {
    if (this.busy.has(adapter.platform)) return;
    this.busy.add(adapter.platform);
    try {
      const agents = await adapter.listAgents(this.ctx);
      for (const agent of agents) {
        const isNew = !this.activeIds.has(agent.id);
        this.activeIds.add(agent.id);
        this.saveAgent(agent);
        // Clients that loaded before the first sync never saw this agent; they refetch on seeing it.
        if (isNew) bus.publish({ type: 'agent', agent });
        if (agent.syncError) continue;
        try {
          const latest = this.store.latestTurn(agent.id);
          const turns = await adapter.syncTurns(agent, this.ctx, latest ? new Date(latest.startedAt) : undefined);
          for (const turn of turns) this.saveTurn(turn);
        } catch (err) {
          this.saveAgent({ ...agent, syncError: String(err) });
          this.log(`${agent.id} sync failed`, { err: String(err) });
        }
      }
    } catch (err) {
      this.log(`${adapter.platform} list failed`, { err: String(err) });
    } finally {
      this.busy.delete(adapter.platform);
    }
  }

  private saveAgent(agent: Agent) {
    const prev = this.store.getAgent(agent.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(agent)) return;
    this.store.upsertAgent(agent);
    bus.publish({ type: 'agent', agent });
  }

  private saveTurn(turn: Turn) {
    const prev = this.store.getTurn(turn.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(turn)) return;
    this.store.upsertTurn(turn);
    bus.publish({ type: 'turn', turn });
  }
}
