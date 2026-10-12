import { describe, expect, it } from 'vitest';
import { mapTriggerState } from '../src/adapters/monday/index.ts';
import { groupIntoTurns, parseActivityTimestamp, TURN_GAP_MS, type ActivityEvent } from '../src/adapters/monday/turns.ts';

const base = Date.parse('2026-10-12T07:00:00Z');
const ev = (id: string, minutes: number, event = 'update_column_value', data: Record<string, unknown> = {}): ActivityEvent => ({
  id,
  event,
  at: base + minutes * 60_000,
  boardId: '2002',
  locationId: 'board:2002',
  data: { pulse_name: '2026-10-12', column_title: 'Meetings', ...data },
});

describe('parseActivityTimestamp', () => {
  it('converts monday 100ns timestamps to ms', () => {
    // 2026-10-12T04:02:54.560Z in ms, times 10,000.
    expect(new Date(parseActivityTimestamp('17917777745600000')).toISOString()).toBe('2026-10-12T04:02:54.560Z');
  });
});

describe('groupIntoTurns', () => {
  it('splits events on gaps larger than the turn gap', () => {
    const turns = groupIntoTurns('monday:1001', [ev('a', 0), ev('b', 2), ev('c', 40), ev('d', 41)], 0, base + 1e9);
    expect(turns.map((t) => t.actions.length)).toEqual([2, 2]);
    expect(turns.map((t) => t.index)).toEqual([0, 1]);
    expect(turns[0]!.status).toBe('succeeded');
  });

  it('keys turns by their first event so regrouping is idempotent', () => {
    const first = groupIntoTurns('monday:1001', [ev('a', 0), ev('b', 2)], 3, base + 1e9);
    const again = groupIntoTurns('monday:1001', [ev('b', 2), ev('a', 0), ev('c', 5)], 3, base + 1e9);
    expect(again[0]!.id).toBe(first[0]!.id);
    expect(again[0]!.actions).toHaveLength(3);
  });

  it('leaves the latest turn open while events may still arrive', () => {
    const turns = groupIntoTurns('monday:1001', [ev('a', 0)], 0, base + TURN_GAP_MS / 2);
    expect(turns[0]!.status).toBe('running');
    expect(turns[0]!.endedAt).toBeUndefined();
  });

  it('describes item creation as an artifact', () => {
    const [turn] = groupIntoTurns('monday:1001', [ev('a', 0, 'create_pulse', { pulse_id: 3003 })], 0, base + 1e9, 'https://acme.monday.com');
    expect(turn!.actions[0]!.summary).toBe('Created item "2026-10-12"');
    expect(turn!.actions[0]!.artifacts[0]!.url).toBe('https://acme.monday.com/boards/2002/pulses/3003');
  });
});

describe('mapTriggerState', () => {
  it.each([
    [undefined, 'pending'],
    ['running', 'running'],
    ['automation_finished_running_successfully', 'succeeded'],
    ['automation_run_failed', 'failed'],
  ])('%s -> %s', (state, expected) => {
    expect(mapTriggerState(state)).toBe(expected);
  });
});
