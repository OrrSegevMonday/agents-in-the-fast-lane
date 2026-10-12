import { agentId } from '@aj/shared';
import type { Config } from '../config.ts';
import { MondayGraphql } from '../adapters/monday/client.ts';
import { AdapterError } from '../adapters/types.ts';
import type { ManagedAgent } from './registry.ts';

const MONDAY_URL = /ai_agents\/user\/(\d+)/;
const SPHERA_URL = /\/agents\/([^/?#]+)/;

export type ParsedAgentUrl =
  | { platform: 'monday'; userId: string; origin: string }
  | { platform: 'sphera'; nativeId: string };

/** Work out which system a pasted agent URL belongs to. Pure, so it is easy to test. */
export function parseAgentUrl(url: string, spheraUiUrl = ''): ParsedAgentUrl | undefined {
  const monday = url.match(MONDAY_URL);
  if (monday) return { platform: 'monday', userId: monday[1]!, origin: new URL(url).origin };
  if (spheraUiUrl && url.startsWith(spheraUiUrl)) {
    const id = url.slice(spheraUiUrl.length).split(/[/?#]/).filter(Boolean)[0];
    if (id) return { platform: 'sphera', nativeId: id };
  }
  const sphera = url.match(SPHERA_URL);
  if (sphera) return { platform: 'sphera', nativeId: sphera[1]! };
  return undefined;
}

export interface Resolved {
  agent: ManagedAgent;
  /** monday account URL learned from the pasted link, when none is configured yet. */
  learnedAccountUrl?: string;
}

/** Turn a pasted URL into a verified agent, using the system's own API. Read-only. */
export async function resolveAgent(url: string, cfg: Config): Promise<Resolved> {
  const parsed = parseAgentUrl(url, cfg.sphera.uiUrl);
  if (!parsed) throw new AdapterError('Unrecognised agent URL. Paste a monday agent editor link or a Sphera agent page link.', 400);

  if (parsed.platform === 'monday') {
    if (!cfg.monday.token) throw new AdapterError('Add the monday API token first.', 400);
    const gql = new MondayGraphql(cfg.monday.apiUrl, cfg.monday.token);
    const { users } = await gql.query<{ users: { email?: string }[] }>('query($ids:[ID!]) { users(ids: $ids) { email } }', {
      ids: [parsed.userId],
    });
    const nativeId = users[0]?.email?.match(/^agent-(\d+)@/)?.[1];
    if (!nativeId) throw new AdapterError(`monday user ${parsed.userId} is not an agent`, 400);
    return {
      agent: { id: agentId('monday', nativeId), platform: 'monday', nativeId, url, enabled: true },
      learnedAccountUrl: cfg.monday.accountUrl ? undefined : parsed.origin,
    };
  }

  if (!cfg.sphera.apiUrl) throw new AdapterError('Set SPHERA_API_URL in .env first (the Sphera Agent Factory API base).', 400);
  const res = await fetch(`${cfg.sphera.apiUrl}/agents/${encodeURIComponent(parsed.nativeId)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new AdapterError(`Sphera has no agent ${parsed.nativeId} (returned ${res.status})`, 400);
  return { agent: { id: agentId('sphera', parsed.nativeId), platform: 'sphera', nativeId: parsed.nativeId, url, enabled: true } };
}
