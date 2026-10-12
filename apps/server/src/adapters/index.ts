import type { Config } from '../config.ts';
import type { Store } from '../store/sqlite.ts';
import { ClaudeMockAdapter } from './mock/claude.ts';
import { CursorMockAdapter } from './mock/cursor.ts';
import { MondayAdapter } from './monday/index.ts';
import { SpheraAdapter } from './sphera.ts';
import type { AgentAdapter } from './types.ts';

export function buildAdapters(cfg: Config, store: Store, log: (msg: string) => void): AgentAdapter[] {
  const adapters: AgentAdapter[] = [];

  if (cfg.monday.token && cfg.monday.agentIds.length) adapters.push(new MondayAdapter(cfg.monday, store));
  else log('monday adapter off: set MONDAY_API_TOKEN and MONDAY_AGENT_IDS');

  if (cfg.sphera.apiUrl && cfg.sphera.agentIds.length) adapters.push(new SpheraAdapter(cfg.sphera, store));
  else log('sphera adapter off: set SPHERA_API_URL and SPHERA_AGENT_IDS');

  if (cfg.mockAgents) adapters.push(new ClaudeMockAdapter(), new CursorMockAdapter());

  return adapters;
}
