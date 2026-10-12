import { BOARD_SLOTS, computeMeters, type Turn } from '@aj/shared';
import { describe, expect, it } from 'vitest';
import { actionTimeline, doorPoint, lastActionAt, nextActionTime, ringPath, RING_MAX, RING_MIN, route, slotCell } from '../src/lib/board.ts';

describe('slotCell', () => {
  it('walks the edge clockwise and covers every edge cell once', () => {
    const cells = Array.from({ length: BOARD_SLOTS }, (_, s) => slotCell(s));
    expect(cells[0]).toEqual({ row: 0, col: 0 });
    expect(cells[4]).toEqual({ row: 0, col: 4 });
    expect(cells[8]).toEqual({ row: 4, col: 4 });
    expect(cells[12]).toEqual({ row: 4, col: 0 });
    expect(cells[15]).toEqual({ row: 1, col: 0 });
    expect(new Set(cells.map((c) => `${c.row},${c.col}`)).size).toBe(BOARD_SLOTS);
  });
});

describe('ringPath', () => {
  it('turns at corners and takes the short way round', () => {
    const topMid = doorPoint(2);
    const rightMid = doorPoint(6);
    expect(ringPath(topMid, rightMid)).toEqual([topMid, { x: RING_MAX, y: RING_MIN }, rightMid]);
    // From top-left going to left side: counter-clockwise is shorter, no corners in between.
    const path = ringPath(doorPoint(1), doorPoint(14));
    expect(path).toEqual([doorPoint(1), { x: RING_MIN, y: RING_MIN }, doorPoint(14)]);
  });

  it('stays put when already there', () => {
    expect(ringPath(doorPoint(3), doorPoint(3))).toEqual([doorPoint(3)]);
  });
});

describe('route', () => {
  it('goes through the plaza spoke to reach the brain', () => {
    const path = route({ kind: 'slot', slot: 2 }, { kind: 'brain' });
    expect(path.at(-1)).toEqual({ x: 50, y: 50 });
    expect(path.at(-2)).toEqual({ x: 50, y: RING_MIN });
  });
});

const turn = (id: string, start: string, actions: [string, number, number][], status: Turn['status'] = 'succeeded'): Turn => ({
  id,
  agentId: 'claude:x',
  index: 0,
  startedAt: start,
  endedAt: actions.at(-1)?.[0] ?? start,
  status,
  trigger: 'test',
  source: 'mock',
  actions: actions.map(([at, cost, arts], i) => ({
    id: `${id}:${i}`,
    turnId: id,
    locationId: `tool:${i}`,
    kind: 'run',
    summary: 's',
    startedAt: at,
    durationMs: 1,
    cost,
    success: true,
    brainReads: 0,
    artifacts: Array.from({ length: arts }, () => ({ kind: 'pr' as const, title: 't' })),
  })),
});

describe('replay helpers', () => {
  const turns = [
    turn('t1', '2026-10-12T08:00:00Z', [
      ['2026-10-12T08:00:00Z', 1, 0],
      ['2026-10-12T08:05:00Z', 2, 1],
    ]),
    turn('t2', '2026-10-12T09:00:00Z', [['2026-10-12T09:00:00Z', 3, 2]], 'failed'),
  ];

  it('finds the action at a moment in time', () => {
    expect(lastActionAt(turns, Date.parse('2026-10-12T08:03:00Z'))?.id).toBe('t1:0');
    expect(lastActionAt(turns, Date.parse('2026-10-12T08:30:00Z'))?.id).toBe('t1:1');
    expect(lastActionAt(turns, Date.parse('2026-10-12T07:00:00Z'))).toBeUndefined();
  });

  it('computes meters as of the cursor', () => {
    expect(computeMeters(turns, Date.parse('2026-10-12T08:30:00Z'))).toEqual({ cost: 3, success: 100, knowledge: 0, output: 1 });
    expect(computeMeters(turns)).toEqual({ cost: 6, success: 50, knowledge: 0, output: 3 });
  });
});

describe('replay timeline', () => {
  const turns = [
    turn('t1', '2026-10-12T08:00:00Z', [
      ['2026-10-12T08:00:00Z', 0, 0],
      ['2026-10-12T08:05:00Z', 0, 0],
    ]),
    turn('t2', '2026-10-12T09:00:00Z', [['2026-10-12T08:05:00Z', 0, 0]]),
  ];

  it('lists each action time once, in order', () => {
    expect(actionTimeline(turns).map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-12T08:00:00.000Z',
      '2026-10-12T08:05:00.000Z',
    ]);
  });

  it('steps strictly forward and ends when caught up', () => {
    const line = actionTimeline(turns);
    expect(nextActionTime(line, Date.parse('2026-10-12T07:00:00Z'))).toBe(line[0]);
    expect(nextActionTime(line, line[0]!)).toBe(line[1]);
    expect(nextActionTime(line, line[1]!)).toBeUndefined();
  });
});
