import { AGENT_ICON_COUNT, type Agent } from '@aj/shared';

export interface IconStore {
  getKv<T>(key: string): T | undefined;
  setKv(key: string, value: unknown): void;
  listKv<T>(prefix: string): { key: string; value: T }[];
}

/**
 * Gives each agent a player icon that is unique within its platform and never changes.
 * Keys end in the agent id, so deleting an agent's per-agent data frees its icon.
 */
export class IconRegistry {
  constructor(private store: IconStore) {}

  assign(agent: Pick<Agent, 'id' | 'platform'>): number {
    const key = `agent-icon:${agent.id}`;
    const existing = this.store.getKv<number>(key);
    if (existing !== undefined) return existing;

    const taken = this.store.listKv<number>(`agent-icon:${agent.platform}:`).map((e) => e.value);
    const used = new Set(taken);
    let icon = 0;
    while (used.has(icon) && icon < AGENT_ICON_COUNT) icon++;
    // More agents than icons on one platform: reuse, spreading repeats evenly.
    if (icon === AGENT_ICON_COUNT) icon = taken.length % AGENT_ICON_COUNT;
    this.store.setKv(key, icon);
    return icon;
  }
}
