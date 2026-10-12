import type { AgentPlatform } from '@aj/shared';
import type { Config } from '../config.ts';

export type ManagedPlatform = Extract<AgentPlatform, 'monday' | 'sphera'>;

export interface ManagedAgent {
  id: string;
  platform: ManagedPlatform;
  nativeId: string;
  url: string;
  enabled: boolean;
}

interface Kv {
  getKv<T>(key: string): T | undefined;
  setKv(key: string, value: unknown): void;
}

const KEY = 'managedAgents';

/**
 * The agents the user asked us to watch. Seeded once from the env id lists, after which
 * this store is the source of truth: disabled agents keep their entry but aren't polled.
 */
export class AgentRegistry {
  constructor(
    private kv: Kv,
    seed: ManagedAgent[] = [],
  ) {
    if (kv.getKv(KEY) === undefined) kv.setKv(KEY, seed);
  }

  list(): ManagedAgent[] {
    return this.kv.getKv<ManagedAgent[]>(KEY) ?? [];
  }

  get(id: string) {
    return this.list().find((a) => a.id === id);
  }

  add(agent: ManagedAgent) {
    this.kv.setKv(KEY, [...this.list(), agent]);
  }

  setEnabled(id: string, enabled: boolean) {
    this.kv.setKv(
      KEY,
      this.list().map((a) => (a.id === id ? { ...a, enabled } : a)),
    );
  }

  remove(id: string) {
    this.kv.setKv(
      KEY,
      this.list().filter((a) => a.id !== id),
    );
  }

  enabledIds(platform: ManagedPlatform) {
    return this.list()
      .filter((a) => a.platform === platform && a.enabled)
      .map((a) => a.nativeId);
  }

  /** Adapters read their agent ids from config, so push the enabled ones there. */
  applyToConfig(cfg: Config) {
    cfg.monday.agentIds = this.enabledIds('monday');
    cfg.sphera.agentIds = this.enabledIds('sphera');
  }
}
