import { BOARD_SLOTS, type Agent, type AgentAction, type AgentPlatform, type Location, type Turn } from '@aj/shared';

/** Board is a 5x5 grid: 16 building slots on the edge around a 3x3 plaza. Coordinates are % of the board. */
export const GRID = 5;
const CELL = 100 / GRID;
/** The ring road runs along the inner edge of the building ring. */
export const RING_MIN = CELL;
export const RING_MAX = 100 - CELL;

export interface Pt {
  x: number;
  y: number;
}

/** Slot index (clockwise from top-left) to grid cell. */
export function slotCell(slot: number): { row: number; col: number } {
  const s = ((slot % BOARD_SLOTS) + BOARD_SLOTS) % BOARD_SLOTS;
  if (s < GRID) return { row: 0, col: s };
  if (s < GRID + 3) return { row: s - GRID + 1, col: GRID - 1 };
  if (s < 2 * GRID + 3) return { row: GRID - 1, col: GRID - 1 - (s - (GRID + 3)) };
  return { row: GRID - 1 - (s - (2 * GRID + 2)), col: 0 };
}

/** The point on the ring road in front of a building's door. */
export function doorPoint(slot: number): Pt {
  const { row, col } = slotCell(slot);
  const cx = (col + 0.5) * CELL;
  const cy = (row + 0.5) * CELL;
  const clamp = (v: number) => Math.min(RING_MAX, Math.max(RING_MIN, v));
  if (row === 0) return { x: clamp(cx), y: RING_MIN };
  if (row === GRID - 1) return { x: clamp(cx), y: RING_MAX };
  if (col === 0) return { x: RING_MIN, y: clamp(cy) };
  return { x: RING_MAX, y: clamp(cy) };
}

export const BRAIN_POINT: Pt = { x: 50, y: 50 };
/** The plaza path to the brain leaves the ring at the top middle. */
const BRAIN_SPOKE: Pt = { x: 50, y: RING_MIN };
const SIDE = RING_MAX - RING_MIN;
const PERIMETER = 4 * SIDE;
const CORNERS: Pt[] = [
  { x: RING_MIN, y: RING_MIN },
  { x: RING_MAX, y: RING_MIN },
  { x: RING_MAX, y: RING_MAX },
  { x: RING_MIN, y: RING_MAX },
];

/** Distance along the ring, clockwise from the top-left corner. */
export function ringParam(p: Pt): number {
  if (p.y === RING_MIN) return p.x - RING_MIN;
  if (p.x === RING_MAX) return SIDE + (p.y - RING_MIN);
  if (p.y === RING_MAX) return 2 * SIDE + (RING_MAX - p.x);
  return 3 * SIDE + (RING_MAX - p.y);
}

/** Shortest walk along the ring between two ring points, including the corners passed. */
export function ringPath(from: Pt, to: Pt): Pt[] {
  const a = ringParam(from);
  const b = ringParam(to);
  const cw = (b - a + PERIMETER) % PERIMETER;
  const clockwise = cw <= PERIMETER - cw;
  const path: Pt[] = [from];
  const cornerParams = [0, SIDE, 2 * SIDE, 3 * SIDE];
  const dist = clockwise ? cw : PERIMETER - cw;

  const passed = cornerParams
    .map((c, i) => ({ i, d: clockwise ? (c - a + PERIMETER) % PERIMETER : (a - c + PERIMETER) % PERIMETER }))
    .filter(({ d }) => d > 0 && d < dist)
    .sort((x, y) => x.d - y.d);
  for (const { i } of passed) path.push(CORNERS[i]!);
  if (to.x !== from.x || to.y !== from.y) path.push(to);
  return path;
}

export type Place = { kind: 'slot'; slot: number } | { kind: 'brain' } | { kind: 'home' };

/** Where a token stands for a place. Agents with no location yet wait at home (bottom middle). */
export function placePoint(place: Place): Pt {
  if (place.kind === 'slot') return doorPoint(place.slot);
  if (place.kind === 'brain') return BRAIN_POINT;
  return { x: 50, y: RING_MAX };
}

/** Full route between two places, using the plaza spoke for the brain. */
export function route(from: Place, to: Place): Pt[] {
  const start = placePoint(from);
  const end = placePoint(to);
  const ringStart = from.kind === 'brain' ? BRAIN_SPOKE : start;
  const ringEnd = to.kind === 'brain' ? BRAIN_SPOKE : end;
  const path = ringPath(ringStart, ringEnd);
  if (from.kind === 'brain') path.unshift(start);
  if (to.kind === 'brain') path.push(end);
  return dedupe(path);
}

function dedupe(path: Pt[]) {
  return path.filter((p, i) => i === 0 || p.x !== path[i - 1]!.x || p.y !== path[i - 1]!.y);
}

export function placeOf(location: Location | undefined): Place {
  if (!location) return { kind: 'home' };
  if (location.kind === 'brain') return { kind: 'brain' };
  if (location.slot === null) return { kind: 'home' };
  return { kind: 'slot', slot: location.slot };
}

/** The action an agent was doing (or last did) at time `at`. Turns must be sorted by start. */
export function lastActionAt(turns: Turn[], at: number): AgentAction | undefined {
  let last: AgentAction | undefined;
  for (const turn of turns) {
    if (Date.parse(turn.startedAt) > at) break;
    for (const action of turn.actions) if (Date.parse(action.startedAt) <= at) last = action;
  }
  return last;
}

export function turnAt(turns: Turn[], at: number): Turn | undefined {
  let current: Turn | undefined;
  for (const turn of turns) {
    if (Date.parse(turn.startedAt) <= at) current = turn;
    else break;
  }
  return current;
}

export const PLATFORM_COLORS: Record<AgentPlatform, string> = {
  monday: '#8b5cff',
  sphera: '#ff4f9a',
  claude: '#e8784d',
  cursor: '#23b5a6',
};

export const PLATFORM_LABEL: Record<AgentPlatform, string> = {
  monday: 'monday',
  sphera: 'Sphera',
  claude: 'Claude',
  cursor: 'Cursor',
};

/** Small offset per agent so tokens on the same door don't stack exactly. */
export function tokenOffset(agents: Agent[], id: string): Pt {
  const i = agents.findIndex((a) => a.id === id);
  const angle = (i * 2 * Math.PI) / Math.max(agents.length, 1);
  return { x: Math.cos(angle) * 2.2, y: Math.sin(angle) * 2.2 };
}

/** Sorted, de-duplicated start times of every action, for stepping through a replay. */
export function actionTimeline(turns: Turn[]): number[] {
  const times = new Set<number>();
  for (const turn of turns) for (const action of turn.actions) times.add(Date.parse(action.startedAt));
  return [...times].sort((a, b) => a - b);
}

/** The first action time strictly after `at`, or undefined when the replay has caught up. */
export function nextActionTime(timeline: number[], at: number): number | undefined {
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid]! <= at) lo = mid + 1;
    else hi = mid;
  }
  return timeline[lo];
}
