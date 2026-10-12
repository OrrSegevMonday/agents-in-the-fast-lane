import type { AgentAction, Location, Turn } from '@aj/shared';
import { formatClock, formatDuration } from '../lib/format.ts';

const SOURCE_NOTE: Record<Turn['source'], string> = {
  native: 'From the platform run history',
  'tool-events': 'Exact tool calls for a run started here',
  'activity-log': 'Inferred from board activity (personal agents act as their owner)',
  github: 'From GitHub activity during the run',
  mock: 'Mock data',
};

export function TurnInspector({
  turn,
  turnNumber,
  totalTurns,
  locations,
  currentActionId,
  onJump,
  onStep,
}: {
  turn: Turn | undefined;
  turnNumber: number;
  totalTurns: number;
  locations: Map<string, Location>;
  currentActionId?: string;
  onJump(action: AgentAction): void;
  onStep(delta: -1 | 1): void;
}) {
  return (
    <section className="panel turn-inspector" aria-label="Turn details">
      <header className="turn-header">
        <button type="button" className="pixel-btn small" onClick={() => onStep(-1)} disabled={turnNumber <= 1} aria-label="Previous turn">
          {'<'}
        </button>
        <h3>{turn ? `Turn ${turnNumber} of ${totalTurns}` : 'No turns yet'}</h3>
        <button type="button" className="pixel-btn small" onClick={() => onStep(1)} disabled={turnNumber >= totalTurns} aria-label="Next turn">
          {'>'}
        </button>
      </header>

      {turn && (
        <>
          <p className="muted">
            <span className={`status status-${turn.status}`}>{turn.status}</span> {formatClock(turn.startedAt)}
            {turn.endedAt && ` · ${formatDuration(Date.parse(turn.endedAt) - Date.parse(turn.startedAt))}`}
            {turn.jobName && ` · ${turn.jobName}`} · {turn.trigger}
          </p>
          <p className="source-note">{SOURCE_NOTE[turn.source]}</p>
          {turn.actions.length === 0 ? (
            <p className="muted">{turn.status === 'pending' ? 'Waiting for the run to start...' : 'No actions recorded.'}</p>
          ) : (
            <ol className="action-list">
              {turn.actions.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    className={`action${action.id === currentActionId ? ' current' : ''}${action.success ? '' : ' failed'}${action.inferred ? ' inferred' : ''}`}
                    onClick={() => onJump(action)}
                    aria-current={action.id === currentActionId ? 'step' : undefined}
                  >
                    <span className="action-time">{formatClock(action.startedAt, true)}</span>
                    <span className="action-where">{locations.get(action.locationId)?.name ?? action.locationId}</span>
                    <span className="action-what">
                      {action.inferred && <span className="inferred-tag">inferred</span>}
                      {action.summary}
                    </span>
                    {action.artifacts.map((art) => (
                      <span key={art.title} className="artifact">
                        {art.kind}: {art.title}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
