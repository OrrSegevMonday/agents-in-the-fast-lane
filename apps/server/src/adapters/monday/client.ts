import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AdapterError } from '../types.ts';

const TIMEOUT_MS = 20_000;

export class MondayGraphql {
  constructor(
    private url: string,
    private token: string,
  ) {}

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new AdapterError(`monday API returned ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new AdapterError(`monday API: ${body.errors.map((e) => e.message).join('; ')}`);
    if (!body.data) throw new AdapterError('monday API returned no data');
    return body.data;
  }
}

/**
 * Agent management (jobs, run, activate) is only exposed through monday's hosted MCP,
 * so the server keeps one MCP session open and calls its tools directly.
 */
export class MondayMcp {
  private client?: Client;
  private connecting?: Promise<Client>;

  constructor(
    private url: string,
    private token: string,
  ) {}

  async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.connect();
    const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: TIMEOUT_MS });
    const content = (result.content ?? []) as { type: string; text?: string }[];
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (result.isError) throw new AdapterError(`monday ${tool}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some tools answer in plain text; callers that need structure check for this.
      return { message: text } as T;
    }
  }

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    this.connecting ??= (async () => {
      const client = new Client({ name: 'agents-jones-ui', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
      });
      await client.connect(transport);
      this.client = client;
      return client;
    })().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
}
