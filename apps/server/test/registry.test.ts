import { BOARD_SLOTS, BRAIN_LOCATION_ID, type Location } from '@aj/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATIONS } from '../src/config/locations.ts';
import { LocationRegistry } from '../src/locations/registry.ts';

function memorySink() {
  const map = new Map<string, Location>();
  return { upsertLocation: (l: Location) => map.set(l.id, l), listLocations: () => [...map.values()], map };
}

describe('LocationRegistry', () => {
  it('seeds the Team Brain and pinned locations', () => {
    const reg = new LocationRegistry(memorySink());
    expect(reg.get(BRAIN_LOCATION_ID)?.slot).toBeNull();
    const pinned = DEFAULT_LOCATIONS.filter((k) => k.pinned);
    for (const k of pinned) expect(reg.get(`${k.kind}:${k.ref}`)?.slot).toBe(k.slot);
  });

  it('returns the same location for the same target, case-insensitive for repos', () => {
    const reg = new LocationRegistry(memorySink());
    const a = reg.ensure('repo', 'Acme/Web-App');
    const b = reg.ensure('repo', 'acme/web-app');
    expect(a.id).toBe(b.id);
  });

  it('fills free slots, then overflows to the annex', () => {
    const reg = new LocationRegistry(memorySink());
    const created = Array.from({ length: BOARD_SLOTS + 2 }, (_, i) => reg.ensure('tool', `tool-${i}`));
    const slots = reg.list().map((l) => l.slot).filter((s): s is number => s !== null);
    expect(new Set(slots).size).toBe(slots.length);
    expect(created.at(-1)!.slot).toBeNull();
  });

  it('keeps slots across restarts', () => {
    const sink = memorySink();
    const first = new LocationRegistry(sink).ensure('board', '123', 'Some board');
    const second = new LocationRegistry(sink).ensure('board', '123');
    expect(second.slot).toBe(first.slot);
  });

  it('notifies about new locations only once', () => {
    const seen: string[] = [];
    const reg = new LocationRegistry(memorySink(), (l) => seen.push(l.id));
    reg.ensure('service', 'datadog');
    reg.ensure('service', 'datadog');
    expect(seen.filter((id) => id === 'service:datadog')).toHaveLength(1);
  });
});

describe('LocationRegistry.rebalance', () => {
  it('frees unvisited slots for visited buildings in the annex, busiest first', () => {
    const reg = new LocationRegistry(memorySink(), () => {}, []);
    const filler = Array.from({ length: BOARD_SLOTS }, (_, i) => reg.ensure('board', `b${i}`));
    const quiet = reg.ensure('board', 'quiet');
    const busy = reg.ensure('board', 'busy');
    expect(quiet.slot).toBeNull();
    expect(busy.slot).toBeNull();

    // Only the first board was visited; the rest of the ring is stale.
    const visits = new Map([[filler[0]!.id, 3], [quiet.id, 1], [busy.id, 9]]);
    reg.rebalance(visits);

    expect(reg.get(filler[0]!.id)!.slot).toBe(filler[0]!.slot);
    expect(reg.get(busy.id)!.slot).not.toBeNull();
    expect(reg.get(quiet.id)!.slot).not.toBeNull();
    expect(reg.get(busy.id)!.slot!).toBeLessThan(reg.get(quiet.id)!.slot!);
    expect(reg.get(filler[1]!.id)!.slot).toBeNull();
  });

  it('never moves pinned buildings and does nothing when no one is waiting', () => {
    const reg = new LocationRegistry(memorySink());
    const before = reg.list().map((l) => [l.id, l.slot]);
    expect(reg.rebalance(new Map())).toEqual([]);
    expect(reg.list().map((l) => [l.id, l.slot])).toEqual(before);
  });
});
