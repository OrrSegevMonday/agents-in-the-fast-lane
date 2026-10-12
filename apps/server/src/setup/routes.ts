import { AddAgentSchema, PatchAgentSchema, SaveSecretSchema, type SetupAgent, type SetupState } from '@aj/shared';
import type { FastifyInstance } from 'fastify';
import { AdapterError } from '../adapters/types.ts';
import type { Config } from '../config.ts';
import type { Poller } from '../poller.ts';
import type { Store } from '../store/sqlite.ts';
import { setEnvValue } from './envFile.ts';
import type { AgentRegistry } from './registry.ts';
import { resolveAgent } from './resolveAgent.ts';
import { isSecretSet, SECRETS } from './systems.ts';

interface Deps {
  store: Store;
  registry: AgentRegistry;
  poller: Poller;
  config: Config;
  envPath: string;
  /** Rebuild adapters from the current config and registry. */
  reload(): Promise<void>;
}

export function registerSetupRoutes(app: FastifyInstance, { store, registry, poller, config, envPath, reload }: Deps) {
  const summarize = (): SetupState => {
    const agents: SetupAgent[] = registry.list().map((m) => {
      const live = store.getAgent(m.id);
      return {
        id: m.id,
        platform: m.platform,
        name: live?.name ?? `${m.platform} agent ${m.nativeId}`,
        url: live?.url ?? m.url,
        enabled: m.enabled,
        status: m.enabled ? live?.status : undefined,
        syncError: m.enabled ? live?.syncError : undefined,
      };
    });
    const secrets = SECRETS.map(({ apply: _apply, ...slot }) => ({ ...slot, isSet: isSecretSet(slot.key) }));
    return { firstRun: !agents.length && !secrets.some((s) => s.isSet), secrets, agents };
  };

  app.get('/api/setup', async () => summarize());

  app.put<{ Params: { key: string } }>('/api/setup/secrets/:key', async (req, reply) => {
    const slot = SECRETS.find((s) => s.key === req.params.key);
    const parsed = SaveSecretSchema.safeParse(req.body);
    if (!slot || !parsed.success) return reply.code(400).send({ message: 'Invalid secret' });
    try {
      setEnvValue(envPath, slot.key, parsed.data.value);
    } catch (err) {
      return reply.code(400).send({ message: err instanceof Error ? err.message : 'Could not save' });
    }
    process.env[slot.key] = parsed.data.value;
    slot.apply(config, parsed.data.value);
    // Never log the value, only that the slot changed.
    req.log.info({ secret: slot.key }, 'secret updated');
    await reload();
    return reply.code(204).send();
  });

  app.post('/api/setup/agents', async (req, reply) => {
    const parsed = AddAgentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Enter a valid agent URL' });
    try {
      const { agent, learnedAccountUrl } = await resolveAgent(parsed.data.url, config);
      if (registry.get(agent.id)) return reply.code(409).send({ message: 'This agent is already added' });
      if (learnedAccountUrl) {
        config.monday.accountUrl = learnedAccountUrl;
        setEnvValue(envPath, 'MONDAY_ACCOUNT_URL', learnedAccountUrl);
      }
      registry.add(agent);
      await reload();
      return summarize().agents.find((a) => a.id === agent.id);
    } catch (err) {
      const status = err instanceof AdapterError && err.status < 500 ? err.status : 502;
      return reply.code(status).send({ message: err instanceof Error ? err.message : 'Could not add agent' });
    }
  });

  app.patch<{ Params: { id: string } }>('/api/setup/agents/:id', async (req, reply) => {
    const parsed = PatchAgentSchema.safeParse(req.body);
    if (!parsed.success || !registry.get(req.params.id)) return reply.code(404).send({ message: 'Unknown agent' });
    registry.setEnabled(req.params.id, parsed.data.enabled);
    if (!parsed.data.enabled) poller.forget(req.params.id);
    req.log.info({ agent: req.params.id, enabled: parsed.data.enabled }, 'agent tracking changed');
    await reload();
    return summarize().agents.find((a) => a.id === req.params.id);
  });

  app.delete<{ Params: { id: string } }>('/api/setup/agents/:id', async (req, reply) => {
    if (!registry.get(req.params.id)) return reply.code(404).send({ message: 'Unknown agent' });
    registry.remove(req.params.id);
    poller.forget(req.params.id);
    store.deleteAgent(req.params.id);
    req.log.info({ agent: req.params.id }, 'agent deleted');
    await reload();
    return reply.code(204).send();
  });
}
