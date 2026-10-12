import type { AgentAction, Turn } from '@aj/shared';

export interface ScheduledJob {
  name: string;
  instructions?: string;
  triggers?: { enabled?: boolean; field_values?: { schedulerConfig?: { value?: SchedulerConfig } } }[];
}

export interface SchedulerConfig {
  /** ISO weekdays, Monday = 1 ... Sunday = 7. */
  days?: number[];
  hour?: number;
  minute?: number;
  timezone?: string;
}

/** A scheduled run may start late and its board writes trail the trigger; anything this far past the slot counts. */
export const SCHEDULE_WINDOW_MIN = 30;

/** Tools a job's instructions can name, and the board location each maps to. */
const TOOL_HINTS: { ref: string; name: string; pattern: RegExp; verb: string }[] = [
  { ref: 'notetaker', name: 'Notetaker', pattern: /notetaker|meeting summar/i, verb: 'Checked meetings in Notetaker' },
  { ref: 'slack', name: 'Slack', pattern: /\bslack\b/i, verb: 'Read Slack' },
  { ref: 'calendar', name: 'Calendar', pattern: /\bcalendar\b/i, verb: 'Checked the calendar' },
];

/** The job whose schedule slot this moment falls in, if any. */
export function matchScheduledJob<J extends ScheduledJob>(at: number, jobs: J[]): J | undefined {
  for (const job of jobs) {
    for (const trigger of job.triggers ?? []) {
      const cfg = trigger.field_values?.schedulerConfig?.value;
      if (trigger.enabled === false || !cfg || cfg.hour === undefined) continue;
      const local = localParts(at, cfg.timezone ?? 'UTC');
      if (cfg.days?.length && !cfg.days.includes(local.isoWeekday)) continue;
      const minutesPast = local.hour * 60 + local.minute - (cfg.hour * 60 + (cfg.minute ?? 0));
      if (minutesPast >= 0 && minutesPast <= SCHEDULE_WINDOW_MIN) return job;
    }
  }
  return undefined;
}

/**
 * Tools the instructions tell the agent to use. Headings, code blocks and inline code are
 * ignored: they are usually templates or labels (a `## Slack` doc section, a `notetaker-era`
 * status value), not tool calls.
 */
export function toolsNamedIn(instructions: string | undefined) {
  if (!instructions) return [];
  const prose = instructions
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\s*(#|\|).*$/gm, ' ');
  return TOOL_HINTS.filter((t) => t.pattern.test(prose));
}

/**
 * Board activity only shows writes. When a turn matches a scheduled job, add the tools that
 * job's instructions name as inferred visits just before the first write, so the token walks
 * there. They are flagged so the UI can show they were not observed.
 */
export function annotateWithJob(
  turn: Turn,
  jobs: ScheduledJob[],
  ensureTool: (ref: string, name: string) => string,
): Turn {
  const job = matchScheduledJob(Date.parse(turn.startedAt), jobs);
  if (!job) return turn;

  const tools = toolsNamedIn(job.instructions);
  const firstAt = Date.parse(turn.startedAt);
  const visits: AgentAction[] = tools.map((tool, i) => ({
    id: `${turn.id}:inferred-${tool.ref}`,
    turnId: turn.id,
    locationId: ensureTool(tool.ref, tool.name),
    kind: 'read',
    summary: `${tool.verb} (inferred from ${job.name} instructions)`,
    startedAt: new Date(firstAt - (tools.length - i) * 20_000).toISOString(),
    durationMs: 20_000,
    cost: 0,
    success: true,
    brainReads: 0,
    artifacts: [],
    inferred: true,
  }));

  return {
    ...turn,
    jobName: job.name,
    trigger: 'schedule (inferred)',
    startedAt: visits[0]?.startedAt ?? turn.startedAt,
    actions: [...visits, ...turn.actions],
  };
}

function localParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    isoWeekday: weekdays.indexOf(get('weekday')) + 1,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}
