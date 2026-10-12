import type { LocationKind } from '@aj/shared';

/** What each kind of building stands for, and the accent color that marks it on the board. */
export const KIND_INFO: Record<LocationKind, { label: string; description: string; color: string }> = {
  board: {
    label: 'Board',
    description: 'A monday board the agent reads or writes items on.',
    color: '#a685ff',
  },
  repo: {
    label: 'Repo',
    description: 'A code repository the agent reads, edits or opens PRs in.',
    color: '#2ec4b6',
  },
  tool: {
    label: 'Tool',
    description: 'An app or capability the agent calls, like Slack, Notetaker or a terminal.',
    color: '#f4a261',
  },
  service: {
    label: 'Service',
    description: 'An external system the agent queries, like monitoring or data.',
    color: '#4cc9f0',
  },
  brain: {
    label: 'Team Brain',
    description: 'Shared team context over MCP. Coming soon.',
    color: '#ff8fab',
  },
};

export const KIND_ORDER: LocationKind[] = ['board', 'repo', 'tool', 'service', 'brain'];
