import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LocationKind } from '@aj/shared';
import { z } from 'zod';

export interface KnownLocation {
  kind: LocationKind;
  ref: string;
  name: string;
  url?: string;
  slot?: number;
  /** Create on startup even before any agent has acted there. */
  pinned?: boolean;
}

/**
 * Generic buildings with fixed slots. Anything else is added automatically the first time
 * an agent acts in it. Account-specific buildings (your boards, repos) belong in the
 * gitignored locations.local.json, which `npm run setup` writes.
 */
export const DEFAULT_LOCATIONS: KnownLocation[] = [
  { kind: 'tool', ref: 'notetaker', name: 'Notetaker', slot: 4, pinned: true },
  { kind: 'tool', ref: 'slack', name: 'Slack', slot: 6, pinned: true },
  { kind: 'tool', ref: 'calendar', name: 'Calendar', slot: 8 },
  { kind: 'tool', ref: 'monday-docs', name: 'monday Docs', slot: 10 },
  { kind: 'tool', ref: 'github', name: 'GitHub', slot: 12, pinned: true },
  { kind: 'tool', ref: 'terminal', name: 'Terminal', slot: 14 },
];

const LocalFileSchema = z.array(
  z.object({
    kind: z.enum(['repo', 'board', 'tool', 'service']),
    ref: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    url: z.string().url().optional(),
    slot: z.number().int().min(0).max(15).optional(),
    pinned: z.boolean().optional(),
  }),
);

/** Defaults plus the private local file, if present. Local entries win on the same kind and ref. */
export function loadKnownLocations(file: string | undefined, log: (msg: string) => void = () => {}): KnownLocation[] {
  if (!file) return DEFAULT_LOCATIONS;
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return DEFAULT_LOCATIONS;
  try {
    const local = LocalFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    const key = (l: KnownLocation) => `${l.kind}:${l.ref}`;
    const localKeys = new Set(local.map(key));
    return [...local, ...DEFAULT_LOCATIONS.filter((d) => !localKeys.has(key(d)))];
  } catch (err) {
    log(`ignoring ${file}: ${String(err)}`);
    return DEFAULT_LOCATIONS;
  }
}
