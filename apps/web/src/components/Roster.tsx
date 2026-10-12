import { computeMeters, type Agent, type Turn } from '@aj/shared';
import { PLATFORM_COLORS, PLATFORM_LABEL } from '../lib/board.ts';
import { Meters } from './Meters.tsx';
import { AgentSprite } from './Sprites.tsx';

export function Roster({
  agents,
  turnsByAgent,
  at,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  turnsByAgent: Map<string, Turn[]>;
  at: number;
  selectedId?: string;
  onSelect(id: string): void;
}) {
  return (
    <nav className="panel roster" aria-label="Players">
      <h2>Players</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.id}>
            <button
              type="button"
              className={`roster-card${agent.id === selectedId ? ' selected' : ''}`}
              onClick={() => onSelect(agent.id)}
              aria-pressed={agent.id === selectedId}
              style={{ ['--token-color' as string]: PLATFORM_COLORS[agent.platform] }}
            >
              <AgentSprite color={PLATFORM_COLORS[agent.platform]} icon={agent.icon} size={28} />
              <span className="roster-text">
                <span className="roster-name">{agent.name}</span>
                <span className="muted">
                  {PLATFORM_LABEL[agent.platform]} · <span className={`status status-${agent.status}`}>{agent.status}</span>
                  {agent.syncError ? ' · offline' : ''}
                </span>
                <Meters values={computeMeters(turnsByAgent.get(agent.id) ?? [], at)} goals={agent.goals} compact />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
