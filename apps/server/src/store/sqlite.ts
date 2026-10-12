import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Agent, Location, Turn } from '@aj/shared';

/**
 * Document store for the game state. Neither live source keeps reliable run
 * history, so every turn we reconstruct is persisted here.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        doc TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS turns_agent_started ON turns (agent_id, started_at);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  upsertAgent(agent: Agent) {
    this.db
      .prepare('INSERT INTO agents (id, doc) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc')
      .run(agent.id, JSON.stringify(agent));
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare('SELECT doc FROM agents WHERE id = ?').get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as Agent) : undefined;
  }

  listAgents(): Agent[] {
    return this.docs<Agent>('SELECT doc FROM agents ORDER BY id');
  }

  upsertLocation(location: Location) {
    this.db
      .prepare('INSERT INTO locations (id, doc) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc')
      .run(location.id, JSON.stringify(location));
  }

  listLocations(): Location[] {
    return this.docs<Location>('SELECT doc FROM locations ORDER BY id');
  }

  upsertTurn(turn: Turn) {
    this.db
      .prepare(
        `INSERT INTO turns (id, agent_id, started_at, doc) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at, doc = excluded.doc`,
      )
      .run(turn.id, turn.agentId, turn.startedAt, JSON.stringify(turn));
  }

  getTurn(id: string): Turn | undefined {
    const row = this.db.prepare('SELECT doc FROM turns WHERE id = ?').get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as Turn) : undefined;
  }

  listTurns(agentId?: string, limit = 500): Turn[] {
    const turns = agentId
      ? this.docs<Turn>('SELECT doc FROM turns WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?', agentId, limit)
      : this.docs<Turn>('SELECT doc FROM turns ORDER BY started_at DESC LIMIT ?', limit);
    return turns.reverse();
  }

  latestTurn(agentId: string): Turn | undefined {
    return this.docs<Turn>('SELECT doc FROM turns WHERE agent_id = ? ORDER BY started_at DESC LIMIT 1', agentId)[0];
  }

  countTurns(agentId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM turns WHERE agent_id = ?').get(agentId) as { n: number };
    return row.n;
  }

  getKv<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  setKv(key: string, value: unknown) {
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  private docs<T>(sql: string, ...params: (string | number)[]): T[] {
    const rows = this.db.prepare(sql).all(...params) as { doc: string }[];
    return rows.map((r) => JSON.parse(r.doc) as T);
  }
}
