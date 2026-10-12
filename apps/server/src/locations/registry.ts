import { BOARD_SLOTS, BRAIN_LOCATION_ID, locationId, type Location, type LocationKind } from '@aj/shared';
import { DEFAULT_LOCATIONS, type KnownLocation } from '../config/locations.ts';

export interface LocationSink {
  upsertLocation(location: Location): void;
  listLocations(): Location[];
}

/**
 * Maps raw targets (a repo slug, board id, tool name) to stable board locations.
 * Pinned locations from config keep their slot; new ones take the next free ring slot,
 * and once the ring is full they go to the annex (slot null).
 */
export class LocationRegistry {
  private byId = new Map<string, Location>();
  /** Locations an enabled adapter referenced since startup. */
  private touched = new Set<string>();

  constructor(
    private sink: LocationSink,
    private onNew: (location: Location) => void = () => {},
    readonly known: KnownLocation[] = DEFAULT_LOCATIONS,
  ) {
    for (const loc of sink.listLocations()) this.byId.set(loc.id, loc);
    this.seed();
  }

  ensure(kind: LocationKind, ref: string, name?: string, url?: string): Location {
    const normalizedRef = normalizeRef(kind, ref);
    const id = locationId(kind, normalizedRef);
    this.touched.add(id);
    const existing = this.byId.get(id);
    if (existing) {
      if ((name && existing.name === existing.ref && name !== existing.name) || (url && !existing.url)) {
        const updated = { ...existing, name: name ?? existing.name, url: url ?? existing.url };
        this.save(updated);
        return updated;
      }
      return existing;
    }
    const known = this.known.find((k) => k.kind === kind && k.ref === normalizedRef);
    const location: Location = {
      id,
      kind,
      ref: normalizedRef,
      name: known?.name ?? name ?? normalizedRef,
      url: known?.url ?? url,
      slot: known?.slot !== undefined && !this.slotTaken(known.slot) ? known.slot : this.nextFreeSlot(),
    };
    this.save(location);
    this.onNew(location);
    return location;
  }

  wasTouched(id: string) {
    return this.touched.has(id);
  }

  get(id: string) {
    return this.byId.get(id);
  }

  list() {
    return [...this.byId.values()];
  }

  /**
   * Keeps the ring for places agents actually use. Frees slots held by unpinned buildings
   * nobody has visited, then gives free slots to visited buildings waiting in the annex,
   * busiest first. Visited buildings never lose their slot. Returns what moved.
   */
  rebalance(visits: Map<string, number>): Location[] {
    const pinned = new Set(this.known.filter((k) => k.pinned).map((k) => locationId(k.kind, normalizeRef(k.kind, k.ref))));
    const moved: Location[] = [];
    const waiting = this.list()
      .filter((l) => l.slot === null && l.kind !== 'brain' && (visits.get(l.id) ?? 0) > 0)
      .sort((a, b) => (visits.get(b.id) ?? 0) - (visits.get(a.id) ?? 0));
    if (!waiting.length) return moved;

    for (const loc of this.list()) {
      if (loc.slot !== null && !pinned.has(loc.id) && !visits.get(loc.id)) {
        const freed = { ...loc, slot: null };
        this.save(freed);
        moved.push(freed);
      }
    }
    for (const loc of waiting) {
      const slot = this.nextFreeSlot();
      if (slot === null) break;
      const placed = { ...loc, slot };
      this.save(placed);
      moved.push(placed);
    }
    return moved;
  }

  private seed() {
    if (!this.byId.has(BRAIN_LOCATION_ID)) {
      this.save({ id: BRAIN_LOCATION_ID, kind: 'brain', ref: 'team-brain', name: 'Team Brain', slot: null });
    }
    for (const known of this.known) {
      if (known.pinned) this.ensure(known.kind, known.ref, known.name, known.url);
    }
  }

  private save(location: Location) {
    this.byId.set(location.id, location);
    this.sink.upsertLocation(location);
  }

  private slotTaken(slot: number) {
    for (const loc of this.byId.values()) if (loc.slot === slot) return true;
    return false;
  }

  private nextFreeSlot(): number | null {
    for (let slot = 0; slot < BOARD_SLOTS; slot++) if (!this.slotTaken(slot)) return slot;
    return null;
  }
}

export function normalizeRef(kind: LocationKind, ref: string) {
  const trimmed = ref.trim();
  return kind === 'repo' || kind === 'tool' || kind === 'service' ? trimmed.toLowerCase() : trimmed;
}
