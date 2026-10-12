import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentId } from '@aj/shared';
import Fastify from 'fastify';
import { buildAdapters } from './adapters/index.ts';
import { NullBrainProvider } from './brain/provider.ts';
import { bus } from './bus.ts';
import { config } from './config.ts';
import { loadKnownLocations } from './config/locations.ts';
import { LocationRegistry } from './locations/registry.ts';
import { Poller } from './poller.ts';
import { registerRoutes } from './routes.ts';
import { Store } from './store/sqlite.ts';
import { ensureEnvFile, ensureGitignored } from './setup/envFile.ts';
import { AgentRegistry, type ManagedAgent } from './setup/registry.ts';
import { registerSetupRoutes } from './setup/routes.ts';

const app = Fastify({ logger: { level: 'info' }, forceCloseConnections: true });
const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);

const store = new Store(config.dbPath);
const locations = new LocationRegistry(
  store,
  (location) => bus.publish({ type: 'location', location }),
  loadKnownLocations(config.locationsFile, log),
);
const brain = new NullBrainProvider(config.brainUrl);

// First use: make sure there is a private .env to write secrets into, and that git ignores it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = resolve(root, '.env');
if (ensureEnvFile(envPath, resolve(root, '.env.example'))) log('created .env from .env.example');
if (ensureGitignored(resolve(root, '.gitignore'))) log('added .env to .gitignore');

// Agents already listed in .env become the registry's starting point.
const seed: ManagedAgent[] = [
  ...config.monday.agentIds.map((nativeId) => ({ id: agentId('monday', nativeId), platform: 'monday' as const, nativeId, url: '', enabled: true })),
  ...config.sphera.agentIds.map((nativeId) => ({ id: agentId('sphera', nativeId), platform: 'sphera' as const, nativeId, url: '', enabled: true })),
];
const registry = new AgentRegistry(store, seed);
registry.applyToConfig(config);

const adapters = buildAdapters(config, store, log);
const poller = new Poller(adapters, store, locations, log);

registerRoutes(app, { store, locations, poller, brain, registry });
registerSetupRoutes(app, {
  store,
  registry,
  poller,
  config,
  envPath,
  reload: async () => {
    registry.applyToConfig(config);
    await poller.reload(buildAdapters(config, store, log));
  },
});

await app.listen({ port: config.port, host: config.host });
log('adapters enabled', { platforms: adapters.map((a) => a.platform) });
await poller.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    poller.stop();
    void app.close().then(() => process.exit(0));
  });
}
