/**
 * `npm run probe`: checks which run-history sources each live platform exposes,
 * so we know whether turns are native or reconstructed.
 */
import { MondayGraphql } from './adapters/monday/client.ts';
import { SpheraAdapter } from './adapters/sphera.ts';
import { config } from './config.ts';

const memoryKv = { getKv: () => undefined, setKv: () => {} };

async function probeMonday() {
  if (!config.monday.token) return console.log('monday: skipped (no MONDAY_API_TOKEN)');
  const gql = new MondayGraphql(config.monday.apiUrl, config.monday.token);
  const data = await gql.query<{
    __schema: { queryType: { fields: { name: string; type: { name: string | null; ofType: { name: string | null } | null } }[] } };
  }>('query { __schema { queryType { fields { name type { name ofType { name } } } } } }');
  const runQueries = data.__schema.queryType.fields.filter((f) =>
    /AgentActivityRun/.test(`${f.type.name ?? ''}${f.type.ofType?.name ?? ''}`),
  );
  console.log(
    runQueries.length
      ? `monday: native agent runs available via ${runQueries.map((f) => f.name).join(', ')}`
      : 'monday: no query exposes AgentActivityRun yet. Using activity logs + tool_events.',
  );
}

async function probeSphera() {
  if (!config.sphera.apiUrl || !config.sphera.agentIds.length) return console.log('sphera: skipped (set SPHERA_API_URL and SPHERA_AGENT_IDS)');
  const sphera = new SpheraAdapter(config.sphera, memoryKv);
  for (const id of config.sphera.agentIds) {
    const found = await sphera.probeHistory(id);
    console.log(`sphera ${id}: ${found ? `history at ${found}` : 'no history endpoint. Using triggered runs + GitHub.'}`);
  }
}

await probeMonday().catch((err) => console.log(`monday: probe failed: ${String(err)}`));
await probeSphera().catch((err) => console.log(`sphera: probe failed (VPN?): ${String(err)}`));
