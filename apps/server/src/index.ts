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

const app = Fastify({ logger: { level: 'info' }, forceCloseConnections: true });
const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);

const store = new Store(config.dbPath);
const locations = new LocationRegistry(
  store,
  (location) => bus.publish({ type: 'location', location }),
  loadKnownLocations(config.locationsFile, log),
);
const brain = new NullBrainProvider(config.brainUrl);
const adapters = buildAdapters(config, store, log);
const poller = new Poller(adapters, store, locations, log);

registerRoutes(app, { store, locations, poller, brain });

await app.listen({ port: config.port, host: config.host });
log('adapters enabled', { platforms: adapters.map((a) => a.platform) });
await poller.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    poller.stop();
    void app.close().then(() => process.exit(0));
  });
}
