import type { Turn } from '@aj/shared';
import { describe, expect, it } from 'vitest';
import { annotateWithJob, matchScheduledJob, toolsNamedIn, type ScheduledJob } from '../src/adapters/monday/jobs.ts';

// A morning job: Sun-Thu 07:00 Asia/Jerusalem.
const morningJob: ScheduledJob = {
  name: 'morning-digest',
  instructions: 'Pull today\'s meetings if a Notetaker capability is available. Post a note to Slack.',
  triggers: [
    {
      enabled: true,
      field_values: {
        schedulerConfig: { value: { days: [7, 1, 2, 3, 4], hour: 7, minute: 0, timezone: 'Asia/Jerusalem' } },
      },
    },
  ],
};
const unscheduled: ScheduledJob = { name: 'handling-slack', instructions: 'Slack things' };

describe('matchScheduledJob', () => {
  it('matches a run a minute after the slot (07:01 IDT on a Monday)', () => {
    expect(matchScheduledJob(Date.parse('2026-10-12T04:01:53Z'), [unscheduled, morningJob])?.name).toBe('morning-digest');
  });

  it('ignores days outside the schedule (Saturday)', () => {
    expect(matchScheduledJob(Date.parse('2026-10-10T04:01:53Z'), [morningJob])).toBeUndefined();
  });

  it('ignores times before the slot or past the window', () => {
    expect(matchScheduledJob(Date.parse('2026-10-12T03:58:00Z'), [morningJob])).toBeUndefined();
    expect(matchScheduledJob(Date.parse('2026-10-12T04:45:00Z'), [morningJob])).toBeUndefined();
  });
});

describe('toolsNamedIn', () => {
  it('finds tools mentioned in instructions', () => {
    expect(toolsNamedIn(morningJob.instructions).map((t) => t.ref)).toEqual(['notetaker', 'slack']);
    expect(toolsNamedIn('just update the board')).toEqual([]);
  });

  it('ignores template headings, tables and code', () => {
    const template = 'Create the Doc:\n```\n## Slack\n```\n## Slack\n| Source | `notetaker-era` |\nSet `slack_col`.';
    expect(toolsNamedIn(template)).toEqual([]);
  });
});

describe('annotateWithJob', () => {
  const turn: Turn = {
    id: 'monday:1001:act-x',
    agentId: 'monday:1001',
    index: 0,
    startedAt: '2026-10-12T04:01:53.000Z',
    status: 'succeeded',
    trigger: 'inferred',
    source: 'activity-log',
    actions: [
      {
        id: 'a',
        turnId: 'monday:1001:act-x',
        locationId: 'board:2002',
        kind: 'create',
        summary: 'Created item',
        startedAt: '2026-10-12T04:01:53.000Z',
        durationMs: 1000,
        cost: 0,
        success: true,
        brainReads: 0,
        artifacts: [],
      },
    ],
  };

  it('adds flagged tool visits before the first write and names the job', () => {
    const out = annotateWithJob(turn, [morningJob], (ref) => `tool:${ref}`);
    expect(out.jobName).toBe('morning-digest');
    expect(out.actions.map((a) => a.locationId)).toEqual(['tool:notetaker', 'tool:slack', 'board:2002']);
    expect(out.actions.slice(0, 2).every((a) => a.inferred)).toBe(true);
    expect(out.actions[2]!.inferred).toBeUndefined();
    expect(Date.parse(out.startedAt)).toBeLessThan(Date.parse(turn.startedAt));
  });

  it('leaves unmatched turns alone', () => {
    const late = { ...turn, startedAt: '2026-10-12T12:00:00.000Z' };
    expect(annotateWithJob(late, [morningJob], (ref) => ref)).toBe(late);
  });
});
