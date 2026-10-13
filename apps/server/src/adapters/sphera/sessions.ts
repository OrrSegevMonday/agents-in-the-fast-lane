import type { AgentAction, LocationKind, Turn, TurnStatus } from '@aj/shared';

/** One agent run, as Sphera's /v2/sessions endpoints return it. */
export interface SpheraSession {
  id: number | string;
  uuid: string;
  triggerSource?: string | null;
  triggerType?: string | null;
  status?: string | null;
  outcomeReason?: string | null;
  title?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  totalCostUsd?: number | null;
  /** Only on the detail endpoint: the agent's narration of what it did. */
  result?: { result?: string | null } | null;
}

/** Most steps a run is split into, so one long narration doesn't flood the inspector. */
export const MAX_STEPS = 12;

export function sessionStatus(s: SpheraSession): TurnStatus {
  const status = (s.status ?? '').toLowerCase();
  const outcome = (s.outcomeReason ?? '').toLowerCase();
  if (status === 'failed' || outcome.includes('fail') || outcome.includes('error')) return 'failed';
  if (s.completedAt || outcome === 'completed') return 'succeeded';
  if (['running', 'active', 'pending', 'queued', 'starting'].includes(status)) return 'running';
  // idle: the run answered and is waiting for the next chat message.
  return status === 'idle' ? 'succeeded' : 'running';
}

/**
 * Splits the agent's narration ("Starting the cycle... Now I'll run the query...") into steps.
 * Sphera joins sentences without spaces, so split wherever a sentence end meets a capital or code.
 */
export function narrationSteps(text: string | null | undefined, max = MAX_STEPS): string[] {
  if (!text?.trim()) return [];
  const sentences = text
    .split(/(?<=[.!?:])\s*(?=[A-Z`*#])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 2);
  if (sentences.length <= max) return sentences;
  const per = Math.ceil(sentences.length / max);
  const steps: string[] = [];
  for (let i = 0; i < sentences.length; i += per) steps.push(sentences.slice(i, i + per).join(' '));
  return steps;
}

/** Where a step happened, from the tools it names. Unnamed steps stay in Sphera itself. */
const PLACES: { pattern: RegExp; kind: LocationKind; ref: string; name: string }[] = [
  { pattern: /\bkremer\b/i, kind: 'service', ref: 'kremer', name: 'Kremer' },
  { pattern: /\bfullstory\b/i, kind: 'service', ref: 'fullstory', name: 'FullStory' },
  { pattern: /\bslack\b/i, kind: 'tool', ref: 'slack', name: 'Slack' },
  { pattern: /\bgithub\b|\bpull request\b/i, kind: 'tool', ref: 'github', name: 'GitHub' },
  { pattern: /\bmonday\b|\bboards?\b|\bitems?\b/i, kind: 'tool', ref: 'monday', name: 'monday' },
  { pattern: /\bsql\b|\bquer(y|ies)\b/i, kind: 'service', ref: 'data-queries', name: 'Data queries' },
];
const HOME = { kind: 'service' as const, ref: 'sphera', name: 'Sphera' };

export function placeForStep(step: string) {
  return PLACES.find((p) => p.pattern.test(step)) ?? HOME;
}

export function sessionTurn(
  agentId: string,
  session: SpheraSession,
  index: number,
  ensure: (kind: LocationKind, ref: string, name: string) => string,
  turnId = `${agentId}:sess-${session.uuid}`,
): Turn {
  const status = sessionStatus(session);
  const start = Date.parse(session.startedAt ?? session.createdAt);
  const endIso = session.completedAt ?? (status === 'running' ? undefined : session.updatedAt ?? undefined);
  const end = endIso ? Math.max(Date.parse(endIso), start + 1000) : Date.now();
  const steps = narrationSteps(session.result?.result);
  const cost = session.totalCostUsd ?? 0;
  const span = (end - start) / Math.max(steps.length, 1);

  const actions: AgentAction[] = steps.map((step, i) => {
    const place = placeForStep(step);
    return {
      id: `${turnId}:${i}`,
      turnId,
      locationId: ensure(place.kind, place.ref, place.name),
      kind: 'run',
      summary: step.length > 220 ? `${step.slice(0, 217)}...` : step,
      startedAt: new Date(start + i * span).toISOString(),
      durationMs: Math.round(span),
      // Sphera reports cost per run, so spread it over the steps.
      cost: Math.round((cost / steps.length) * 10000) / 10000,
      success: !(status === 'failed' && i === steps.length - 1),
      brainReads: 0,
      artifacts: [],
      // The words are the agent's own; where and when each step happened is inferred.
      inferred: true,
    };
  });

  return {
    id: turnId,
    agentId,
    index,
    startedAt: new Date(start).toISOString(),
    endedAt: endIso ? new Date(end).toISOString() : undefined,
    status,
    trigger: [session.triggerType, session.triggerSource].filter(Boolean).join(' via ') || 'sphera',
    jobName: session.title ?? undefined,
    source: 'native',
    actions,
  };
}
