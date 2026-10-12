import type { Agent, AgentAction, BrainStatus, Location, Turn } from '@aj/shared';
import { useMemo } from 'react';
import { PLATFORM_COLORS } from '../lib/board.ts';
import { formatClock } from '../lib/format.ts';
import { Modal } from './Modal.tsx';
import { BuildingSprite } from './Sprites.tsx';

const MAX_ROWS = 60;

export function BuildingInterior({
  location,
  turns,
  agents,
  at,
  brain,
  onClose,
  onJump,
}: {
  location: Location;
  turns: Turn[];
  agents: Map<string, Agent>;
  at: number;
  brain: BrainStatus;
  onClose(): void;
  onJump(agentId: string, action: AgentAction): void;
}) {
  const visits = useMemo(() => {
    const rows: { agentId: string; action: AgentAction }[] = [];
    for (const turn of turns) {
      for (const action of turn.actions) {
        if (action.locationId === location.id && Date.parse(action.startedAt) <= at) rows.push({ agentId: turn.agentId, action });
      }
    }
    return rows.sort((a, b) => b.action.startedAt.localeCompare(a.action.startedAt)).slice(0, MAX_ROWS);
  }, [turns, location.id, at]);

  return (
    <Modal title={location.name} onClose={onClose} wide>
      <div className="interior">
        <div className="interior-hero">
          <BuildingSprite kind={location.kind} size={96} />
          <div>
            <p className="muted">
              {location.kind} · {location.ref}
            </p>
            {location.url && (
              <a href={location.url} target="_blank" rel="noreferrer noopener">
                Open {location.name}
              </a>
            )}
          </div>
        </div>

        {location.kind === 'brain' && <BrainPlaceholder brain={brain} />}

        <h3>What happened here</h3>
        {visits.length === 0 ? (
          <p className="muted">No agent has acted here yet.</p>
        ) : (
          <ul className="visit-list">
            {visits.map(({ agentId, action }) => {
              const agent = agents.get(agentId);
              return (
                <li key={action.id}>
                  <button type="button" className={`action${action.inferred ? ' inferred' : ''}`} onClick={() => onJump(agentId, action)}>
                    <span className="action-time">{formatClock(action.startedAt)}</span>
                    <span className="action-where" style={{ color: agent ? PLATFORM_COLORS[agent.platform] : undefined }}>
                      {agent?.name ?? agentId}
                    </span>
                    <span className="action-what">
                      {action.inferred && <span className="inferred-tag">inferred</span>}
                      {action.summary}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function BrainPlaceholder({ brain }: { brain: BrainStatus }) {
  return (
    <div className="brain-placeholder">
      <p>
        <strong>Team Brain:</strong> {brain.message}
      </p>
      <p className="muted">
        Shared team context will be served here over MCP. Once it's connected, every read an agent makes from it counts toward
        that agent's Knowledge meter.
      </p>
      <dl className="brain-config">
        <dt>MCP URL</dt>
        <dd>{brain.url ?? 'not set (TEAM_BRAIN_MCP_URL)'}</dd>
        <dt>Status</dt>
        <dd>{brain.connected ? 'connected' : 'not connected'}</dd>
      </dl>
    </div>
  );
}
