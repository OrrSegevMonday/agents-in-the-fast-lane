import type { BrainStatus } from '@aj/shared';

/**
 * Team Brain: shared team context served over MCP. Agents read from it, and those
 * reads feed the Knowledge meter. Only the placeholder exists for now.
 */
export interface BrainProvider {
  status(): BrainStatus;
  query(question: string): Promise<{ answer: string; sources: string[] }>;
  /** Context reads made by an agent since `since`. */
  recentReads(agentId: string, since: Date): Promise<number>;
}

export class NullBrainProvider implements BrainProvider {
  constructor(private url: string) {}

  status(): BrainStatus {
    return {
      connected: false,
      url: this.url || undefined,
      message: this.url
        ? 'Team Brain MCP URL is configured, but the connector is not built yet.'
        : 'Team Brain is not connected yet. Set TEAM_BRAIN_MCP_URL once the MCP is ready.',
    };
  }

  async query(): Promise<{ answer: string; sources: string[] }> {
    return { answer: 'Team Brain is not connected yet.', sources: [] };
  }

  async recentReads(): Promise<number> {
    return 0;
  }
}
