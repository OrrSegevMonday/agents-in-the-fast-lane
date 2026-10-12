import type { ActionKind, AgentAction, Artifact, Turn } from '@aj/shared';

export interface ActivityEvent {
  id: string;
  event: string;
  /** Epoch ms. */
  at: number;
  boardId: string;
  locationId: string;
  data: Record<string, unknown>;
}

/** Events closer together than this belong to the same turn. */
export const TURN_GAP_MS = 15 * 60_000;

/** monday activity_logs.created_at is a 17-digit string in 100ns units. */
export function parseActivityTimestamp(createdAt: string): number {
  return Math.floor(Number(createdAt) / 10_000);
}

/**
 * Groups a time-ordered stream of board events into turns. Turn ids come from the
 * first event, so regrouping overlapping windows upserts the same turn instead of
 * duplicating it.
 */
export function groupIntoTurns(
  agentId: string,
  events: ActivityEvent[],
  firstIndex: number,
  now: number,
  /** Account web address for item links; links are omitted when unset. */
  accountUrl = '',
  gapMs = TURN_GAP_MS,
): Turn[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const groups: ActivityEvent[][] = [];
  for (const ev of sorted) {
    const current = groups[groups.length - 1];
    const last = current?.[current.length - 1];
    if (current && last && ev.at - last.at <= gapMs) current.push(ev);
    else groups.push([ev]);
  }

  return groups.map((group, i) => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const turnId = `${agentId}:act-${first.id}`;
    const isOpen = now - last.at < gapMs;
    return {
      id: turnId,
      agentId,
      index: firstIndex + i,
      startedAt: new Date(first.at).toISOString(),
      endedAt: isOpen ? undefined : new Date(last.at).toISOString(),
      status: isOpen ? 'running' : 'succeeded',
      trigger: 'inferred',
      source: 'activity-log',
      actions: group.map((ev, j) => eventToAction(turnId, ev, accountUrl, group[j + 1]?.at)),
    };
  });
}

function eventToAction(turnId: string, ev: ActivityEvent, accountUrl: string, nextAt?: number): AgentAction {
  const item = str(ev.data.pulse_name);
  const { kind, summary } = describe(ev, item);
  const artifacts: Artifact[] = [];
  const pulseId = ev.data.pulse_id;
  if (ev.event === 'create_pulse' && item) {
    artifacts.push({
      kind: 'item',
      title: item,
      url: pulseId && accountUrl ? `${accountUrl}/boards/${ev.boardId}/pulses/${String(pulseId)}` : undefined,
    });
  }
  return {
    id: `${turnId}:${ev.id}`,
    turnId,
    locationId: ev.locationId,
    kind,
    summary,
    startedAt: new Date(ev.at).toISOString(),
    durationMs: nextAt ? Math.min(nextAt - ev.at, 60_000) : 1_000,
    // Activity logs carry no credit usage.
    cost: 0,
    success: true,
    brainReads: 0,
    artifacts,
  };
}

function describe(ev: ActivityEvent, item: string): { kind: ActionKind; summary: string } {
  const on = item ? ` on "${item}"` : '';
  switch (ev.event) {
    case 'create_pulse':
      return { kind: 'create', summary: `Created item "${item || 'untitled'}"` };
    case 'update_column_value':
      return { kind: 'update', summary: `Set ${str(ev.data.column_title) || 'a column'}${on}` };
    case 'update_name':
      return { kind: 'update', summary: `Renamed item${on}` };
    case 'create_update':
    case 'create_post':
      return { kind: 'comment', summary: `Posted an update${on}` };
    case 'move_pulse_into_group':
      return { kind: 'update', summary: `Moved item${on}` };
    case 'delete_pulse':
    case 'archive_pulse':
      return { kind: 'update', summary: `Removed item${on}` };
    default:
      return { kind: 'update', summary: `${ev.event.replaceAll('_', ' ')}${on}` };
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
