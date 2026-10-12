import { ControlRequestSchema, type ControlResponse, type GameState, type Location, type StreamEvent } from '@aj/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdapterError } from './adapters/types.ts';
import type { BrainProvider } from './brain/provider.ts';
import { bus } from './bus.ts';
import type { LocationRegistry } from './locations/registry.ts';
import type { Poller } from './poller.ts';
import type { Store } from './store/sqlite.ts';

interface Deps {
  store: Store;
  locations: LocationRegistry;
  poller: Poller;
  brain: BrainProvider;
}

const TurnsQuery = z.object({
  agentId: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export function registerRoutes(app: FastifyInstance, { store, locations, poller, brain }: Deps) {
  // History of agents whose adapter is now off (e.g. MOCK_AGENTS=false) stays in the store but isn't shown.
  const activeAgents = () => store.listAgents().filter((a) => poller.isActive(a.id));

  app.get('/api/state', async (): Promise<GameState> => {
    const turns = store.listTurns(undefined, 2000).filter((t) => poller.isActive(t.agentId));
    const visited = new Set(turns.flatMap((t) => t.actions.map((a) => a.locationId)));
    return {
      agents: activeAgents(),
      // Hide buildings only inactive agents ever used; keep pinned ones and the Team Brain.
      locations: locations
        .list()
        .filter((l) => l.kind === 'brain' || isPinned(locations, l) || visited.has(l.id) || locations.wasTouched(l.id)),
      turns,
      brain: brain.status(),
    };
  });

  app.get('/api/agents', async () => activeAgents());
  app.get('/api/locations', async () => locations.list());
  app.get('/api/brain', async () => brain.status());

  app.get('/api/turns', async (req, reply) => {
    const parsed = TurnsQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    return store.listTurns(parsed.data.agentId, parsed.data.limit).filter((t) => poller.isActive(t.agentId));
  });

  app.post<{ Params: { id: string } }>('/api/agents/:id/control', async (req, reply): Promise<ControlResponse> => {
    const parsed = ControlRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Invalid control request' });

    const agent = poller.isActive(req.params.id) ? store.getAgent(req.params.id) : undefined;
    if (!agent) return reply.code(404).send({ ok: false, message: 'Unknown agent' });
    const adapter = poller.adapterFor(agent);
    if (!adapter) return reply.code(404).send({ ok: false, message: 'No adapter for this platform' });

    const body = parsed.data;
    try {
      let result: ControlResponse;
      switch (body.action) {
        case 'pause':
          if (!adapter.pause || !agent.capabilities.pause) return unsupported(reply);
          result = await adapter.pause(agent);
          break;
        case 'resume':
          if (!adapter.resume || !agent.capabilities.resume) return unsupported(reply);
          result = await adapter.resume(agent);
          break;
        case 'assignGoal':
          if (!adapter.assignGoal || !agent.capabilities.assignGoal) return unsupported(reply);
          result = await adapter.assignGoal(agent, body.text, body.jobId);
          break;
        case 'triggerTurn':
          if (!adapter.triggerTurn || !agent.capabilities.triggerTurn) return unsupported(reply);
          result = await adapter.triggerTurn(agent, poller.ctx, body.message, body.jobId);
          break;
      }
      void poller.refresh(agent);
      req.log.info({ agent: agent.id, action: body.action }, 'control action');
      return result;
    } catch (err) {
      const status = err instanceof AdapterError ? err.status : 500;
      req.log.warn({ agent: agent.id, action: body.action, err: String(err) }, 'control action failed');
      return reply.code(status).send({ ok: false, message: err instanceof Error ? err.message : 'Control failed' });
    }
  });

  app.get('/api/stream', (req, reply) => {
    // We write the response ourselves for the lifetime of the connection.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(': connected\n\n');
    const send = (event: StreamEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    const unsubscribe = bus.subscribe(send);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}

function isPinned(locations: LocationRegistry, location: Location) {
  return locations.known.some((k) => k.pinned && `${k.kind}:${k.ref}` === location.id);
}

function unsupported(reply: { code(n: number): { send(b: unknown): unknown } }) {
  return reply.code(400).send({ ok: false, message: 'This agent does not support that action' }) as never;
}
