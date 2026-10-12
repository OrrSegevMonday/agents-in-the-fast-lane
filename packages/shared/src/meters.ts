import type { AgentAction, Meters, Turn } from './domain.ts';

export const EMPTY_METERS: Meters = { cost: 0, success: 0, knowledge: 0, output: 0 };

export const DEFAULT_GOALS: Meters = { cost: 50, success: 90, knowledge: 100, output: 40 };

/** Meters for an agent as of `at` (inclusive). Turns still running count toward cost/output but not success. */
export function computeMeters(turns: Turn[], at: number = Number.POSITIVE_INFINITY): Meters {
  let cost = 0;
  let knowledge = 0;
  let output = 0;
  let finished = 0;
  let succeeded = 0;

  for (const turn of turns) {
    if (Date.parse(turn.startedAt) > at) continue;
    for (const action of actionsUpTo(turn, at)) {
      cost += action.cost;
      knowledge += action.brainReads;
      output += action.artifacts.length;
    }
    const isFinished = turn.status === 'succeeded' || turn.status === 'failed';
    const endedBy = turn.endedAt ? Date.parse(turn.endedAt) <= at : true;
    if (isFinished && endedBy) {
      finished += 1;
      if (turn.status === 'succeeded') succeeded += 1;
    }
  }

  return {
    cost: round2(cost),
    success: finished === 0 ? 0 : Math.round((succeeded / finished) * 100),
    knowledge,
    output,
  };
}

export function actionsUpTo(turn: Turn, at: number): AgentAction[] {
  return turn.actions.filter((a) => Date.parse(a.startedAt) <= at);
}

/** 0..1 progress of a meter toward its goal. Cost is a budget, so it is reported as spend vs budget. */
export function meterProgress(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
