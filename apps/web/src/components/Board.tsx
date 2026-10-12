import { BRAIN_LOCATION_ID, type Agent, type AgentAction, type Location } from '@aj/shared';
import { memo, useMemo } from 'react';
import { STEP_MS, useWalk } from '../hooks/useWalk.ts';
import { GRID, PLATFORM_COLORS, placeOf, slotCell, tokenOffset } from '../lib/board.ts';
import { AgentSprite, BuildingSprite } from './Sprites.tsx';

interface BoardProps {
  agents: Agent[];
  locations: Location[];
  /** Each agent's current action at the cursor. */
  current: Map<string, AgentAction | undefined>;
  selectedAgentId?: string;
  animate: boolean;
  onSelectAgent(id: string): void;
  onOpenLocation(id: string): void;
}

export function Board({ agents, locations, current, selectedAgentId, animate, onSelectAgent, onOpenLocation }: BoardProps) {
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const ring = locations.filter((l) => l.slot !== null && l.kind !== 'brain');
  const brain = byId.get(BRAIN_LOCATION_ID);
  const busy = useMemo(() => {
    const counts = new Map<string, Agent[]>();
    for (const agent of agents) {
      const loc = current.get(agent.id)?.locationId;
      if (loc) counts.set(loc, [...(counts.get(loc) ?? []), agent]);
    }
    return counts;
  }, [agents, current]);

  return (
    <div className="board" role="group" aria-label="Agent town board">
      <div className="board-grid" style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)`, gridTemplateRows: `repeat(${GRID}, 1fr)` }}>
        {ring.map((loc) => {
          const { row, col } = slotCell(loc.slot!);
          return (
            <Building
              key={loc.id}
              location={loc}
              visitors={busy.get(loc.id) ?? []}
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
              onOpen={onOpenLocation}
            />
          );
        })}
        <div className="plaza" style={{ gridRow: '2 / span 3', gridColumn: '2 / span 3' }}>
          <div className="road" aria-hidden="true" />
          {brain && (
            <button
              type="button"
              className="building brain"
              onClick={() => onOpenLocation(brain.id)}
              aria-label={`${brain.name}. Not connected yet. Open details.`}
            >
              <BuildingSprite kind="brain" size={72} />
              <span className="building-name">{brain.name}</span>
              <span className="building-sub">coming soon</span>
            </button>
          )}
        </div>
      </div>
      {agents.map((agent) => (
        <Token
          key={agent.id}
          agent={agent}
          location={byId.get(current.get(agent.id)?.locationId ?? '')}
          offset={tokenOffset(agents, agent.id)}
          selected={agent.id === selectedAgentId}
          animate={animate}
          onSelect={onSelectAgent}
        />
      ))}
    </div>
  );
}

const Building = memo(function Building({
  location,
  visitors,
  style,
  onOpen,
}: {
  location: Location;
  visitors: Agent[];
  style: React.CSSProperties;
  onOpen(id: string): void;
}) {
  const label = `${location.name}, ${location.kind}${visitors.length ? `, ${visitors.length} agent${visitors.length > 1 ? 's' : ''} here` : ''}. Open.`;
  return (
    <button type="button" className={`building kind-${location.kind}`} style={style} onClick={() => onOpen(location.id)} aria-label={label}>
      <BuildingSprite kind={location.kind} />
      <span className="building-name" title={location.name}>
        {location.name}
      </span>
      {visitors.length > 0 && (
        <span className="visitors" aria-hidden="true">
          {visitors.map((v) => (
            <span key={v.id} className="visitor-dot" style={{ background: PLATFORM_COLORS[v.platform] }} />
          ))}
        </span>
      )}
    </button>
  );
});

function Token({
  agent,
  location,
  offset,
  selected,
  animate,
  onSelect,
}: {
  agent: Agent;
  location: Location | undefined;
  offset: { x: number; y: number };
  selected: boolean;
  animate: boolean;
  onSelect(id: string): void;
}) {
  const place = useMemo(() => placeOf(location), [location?.id, location?.slot, location?.kind]);
  const { point, walking } = useWalk(place, animate);
  const color = PLATFORM_COLORS[agent.platform];
  return (
    <button
      type="button"
      className={`token${selected ? ' selected' : ''}${walking ? ' walking' : ''}${agent.status === 'paused' ? ' paused' : ''}`}
      style={{
        left: `${point.x + offset.x}%`,
        top: `${point.y + offset.y}%`,
        transitionDuration: animate ? `${STEP_MS}ms` : '0ms',
        ['--token-color' as string]: color,
      }}
      onClick={() => onSelect(agent.id)}
      aria-label={`${agent.name} (${agent.platform}), ${agent.status}${location ? `, at ${location.name}` : ''}. Select.`}
      aria-pressed={selected}
    >
      <AgentSprite color={color} />
      <span className="token-name">{agent.name}</span>
    </button>
  );
}
