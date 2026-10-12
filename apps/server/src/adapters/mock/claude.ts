import { MockAdapter, type MockAgentSpec } from './base.ts';

export class ClaudeMockAdapter extends MockAdapter {
  platform = 'claude' as const;
  specs: MockAgentSpec[] = [
    {
      nativeId: 'claude-code-builder',
      name: 'Claudette',
      role: 'Claude Code builder',
      goal: 'Ship the web app MVP',
      cadenceMinutes: 45,
      costPerAction: 0.18,
      haunts: [
        { kind: 'repo', ref: 'acme/web-app', name: 'web-app' },
        { kind: 'tool', ref: 'terminal', name: 'Terminal' },
        { kind: 'tool', ref: 'github', name: 'GitHub' },
        { kind: 'tool', ref: 'browser', name: 'Browser' },
      ],
    },
    {
      nativeId: 'claude-pr-reviewer',
      name: 'Revy',
      role: 'Claude PR reviewer',
      goal: 'Review every open PR within an hour',
      cadenceMinutes: 30,
      costPerAction: 0.09,
      haunts: [
        { kind: 'tool', ref: 'github', name: 'GitHub' },
        { kind: 'repo', ref: 'acme/api-server', name: 'api-server' },
        { kind: 'tool', ref: 'slack', name: 'Slack' },
      ],
    },
  ];
}
