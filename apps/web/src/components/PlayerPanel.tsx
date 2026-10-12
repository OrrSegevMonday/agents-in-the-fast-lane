import { computeMeters, type Agent, type Turn } from '@aj/shared';
import { useMemo } from 'react';
import { PLATFORM_COLORS, PLATFORM_LABEL } from '../lib/board.ts';
import type { ControlKind } from './ControlDialog.tsx';
import { Meters } from './Meters.tsx';
import { AgentSprite } from './Sprites.tsx';

export function PlayerPanel({ agent, turns, at, onControl }: { agent: Agent; turns: Turn[]; at: number; onControl(kind: ControlKind): void }) {
  const meters = useMemo(() => computeMeters(turns, at), [turns, at]);
  const caps = agent.capabilities;
  const isPaused = agent.status === 'paused';

  return (
    <section className="panel player-panel" aria-label={`${agent.name} details`}>
      <header className="player-header" style={{ ['--token-color' as string]: PLATFORM_COLORS[agent.platform] }}>
        <AgentSprite color={PLATFORM_COLORS[agent.platform]} icon={agent.icon} size={40} />
        <div>
          <h2>{agent.name}</h2>
          <p className="muted">
            <span className="platform-tag">{PLATFORM_LABEL[agent.platform]}</span> {agent.role}
          </p>
          <p className={`status status-${agent.status}`}>{agent.status}</p>
        </div>
      </header>

      {agent.syncError && (
        <p className="error" role="status">
          Can&apos;t reach source: {agent.syncError}
        </p>
      )}

      <Meters values={meters} goals={agent.goals} />

      {agent.goal && (
        <details className="goal">
          <summary>Goal</summary>
          <p>{agent.goal}</p>
        </details>
      )}

      {agent.jobs && agent.jobs.length > 0 && (
        <details className="goal">
          <summary>Jobs ({agent.jobs.length})</summary>
          <ul className="job-list">
            {agent.jobs.map((j) => (
              <li key={j.id} className={j.enabled ? '' : 'muted'}>
                {j.name}
                {j.enabled ? '' : ' (off)'}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="controls">
        {isPaused
          ? caps.resume && (
              <button type="button" className="pixel-btn" onClick={() => onControl('resume')}>
                Resume
              </button>
            )
          : caps.pause && (
              <button type="button" className="pixel-btn" onClick={() => onControl('pause')}>
                Pause
              </button>
            )}
        {caps.triggerTurn && (
          <button type="button" className="pixel-btn primary" onClick={() => onControl('triggerTurn')} disabled={isPaused}>
            Run turn
          </button>
        )}
        {caps.assignGoal && (
          <button type="button" className="pixel-btn" onClick={() => onControl('assignGoal')}>
            Set goals
          </button>
        )}
        {agent.url && (
          <a className="pixel-btn" href={agent.url} target="_blank" rel="noreferrer noopener">
            Open in {PLATFORM_LABEL[agent.platform]}
          </a>
        )}
      </div>
    </section>
  );
}
