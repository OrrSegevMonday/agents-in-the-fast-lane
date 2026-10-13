import { describe, expect, it } from 'vitest';
import { narrationSteps, placeForStep, sessionStatus, sessionTurn, type SpheraSession } from '../src/adapters/sphera/sessions.ts';

const base: SpheraSession = {
  id: 1,
  uuid: 'agent:7:thread:1',
  triggerSource: 'sphera',
  triggerType: 'chat',
  status: 'idle',
  outcomeReason: 'completed',
  createdAt: '2026-10-12T16:20:20.000Z',
  startedAt: '2026-10-12T16:20:20.000Z',
  completedAt: '2026-10-12T16:37:06.000Z',
  totalCostUsd: 2.4,
  result: {
    result:
      "Starting the cycle with the `discovery` skill.Now I'll find the active cycle item on the board.Running the funnel query in Kremer.Posted the summary to Slack.",
  },
};

describe('narrationSteps', () => {
  it('splits sentences that Sphera joins without spaces', () => {
    expect(narrationSteps(base.result!.result)).toEqual([
      'Starting the cycle with the `discovery` skill.',
      "Now I'll find the active cycle item on the board.",
      'Running the funnel query in Kremer.',
      'Posted the summary to Slack.',
    ]);
  });

  it('merges long narrations into at most the step limit', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Step number ${i}.`).join('');
    const steps = narrationSteps(long, 12);
    expect(steps.length).toBeLessThanOrEqual(12);
    expect(steps.join(' ')).toContain('Step number 29.');
  });

  it('handles missing narration', () => {
    expect(narrationSteps(null)).toEqual([]);
  });
});

describe('placeForStep', () => {
  it('places steps at the tools they name, Kremer before generic queries', () => {
    expect(placeForStep('Running the funnel query in Kremer.').ref).toBe('kremer');
    expect(placeForStep('Posted the summary to Slack.').ref).toBe('slack');
    expect(placeForStep('Find the active item on the board.').ref).toBe('monday');
    expect(placeForStep('Running the inventory query.').ref).toBe('data-queries');
    expect(placeForStep('Thinking about next steps.').ref).toBe('sphera');
  });
});

describe('sessionStatus', () => {
  it.each([
    [{ status: 'idle', outcomeReason: 'completed' }, 'succeeded'],
    [{ status: 'failed', outcomeReason: null, completedAt: null }, 'failed'],
    [{ status: 'running', outcomeReason: null, completedAt: null }, 'running'],
    [{ status: 'idle', outcomeReason: null, completedAt: null }, 'succeeded'],
  ])('%o -> %s', (patch, expected) => {
    expect(sessionStatus({ ...base, ...patch })).toBe(expected);
  });
});

describe('sessionTurn', () => {
  it('builds a turn with steps spread over the run and cost split across them', () => {
    const turn = sessionTurn('sphera:7', base, 0, (kind, ref) => `${kind}:${ref}`);
    expect(turn.id).toBe('sphera:7:sess-agent:7:thread:1');
    expect(turn.status).toBe('succeeded');
    expect(turn.trigger).toBe('chat via sphera');
    expect(turn.actions.map((a) => a.locationId)).toEqual(['service:sphera', 'tool:monday', 'service:kremer', 'tool:slack']);
    expect(turn.actions.every((a) => a.inferred)).toBe(true);
    expect(turn.actions.reduce((sum, a) => sum + a.cost, 0)).toBeCloseTo(2.4, 3);
    expect(Date.parse(turn.actions[3]!.startedAt)).toBeLessThan(Date.parse(base.completedAt!));
  });

  it('keeps a given turn id, so a run started from the app is not duplicated', () => {
    expect(sessionTurn('sphera:7', base, 0, () => 'x', 'sphera:7:exec-abc').id).toBe('sphera:7:exec-abc');
  });
});
