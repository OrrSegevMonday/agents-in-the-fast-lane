import { MockAdapter, type MockAgentSpec } from './base.ts';

export class CursorMockAdapter extends MockAdapter {
  platform = 'cursor' as const;
  specs: MockAgentSpec[] = [
    {
      nativeId: 'cursor-bg-refactor',
      name: 'Curt',
      role: 'Cursor background agent',
      goal: 'Migrate legacy selectors to the new store',
      cadenceMinutes: 60,
      costPerAction: 0.12,
      haunts: [
        { kind: 'repo', ref: 'acme/api-server', name: 'api-server' },
        { kind: 'tool', ref: 'terminal', name: 'Terminal' },
        { kind: 'service', ref: 'datadog', name: 'Datadog' },
        { kind: 'tool', ref: 'github', name: 'GitHub' },
      ],
    },
  ];
}
