import type { Location, LocationKind } from '@aj/shared';
import { AGENT_ICONS } from '../lib/agentIcons.ts';
import { PLATFORM_COLORS } from '../lib/board.ts';
import { KIND_INFO, KIND_ORDER } from '../lib/kinds.ts';
import { Modal } from './Modal.tsx';
import { AgentSprite, BuildingSprite } from './Sprites.tsx';

/** Key for the board: one entry per building kind, with how many of each are in town. */
export function Legend({ locations, onClose }: { locations: Location[]; onClose(): void }) {
  const counts = new Map<LocationKind, number>();
  for (const l of locations) counts.set(l.kind, (counts.get(l.kind) ?? 0) + 1);

  return (
    <Modal title="Legend" onClose={onClose}>
      <div className="legend">
        <ul>
          {KIND_ORDER.map((kind) => {
            const info = KIND_INFO[kind];
            const count = counts.get(kind) ?? 0;
            return (
              <li key={kind} className={count ? '' : 'muted'} style={{ ['--kind-color' as string]: info.color }}>
                <BuildingSprite kind={kind} size={32} />
                <span className="legend-text">
                  <span className="legend-label">
                    {info.label}
                    {kind !== 'brain' && <span className="legend-count"> ×{count}</span>}
                  </span>
                  <span className="legend-desc">{info.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="legend-note muted">Buildings are placed automatically the first time an agent works somewhere.</p>

        <h3 className="legend-heading">Player icons</h3>
        <p className="legend-note muted">
          Color shows the platform. Each agent also gets its own hat, unique within its platform, and keeps it for good.
        </p>
        <ul className="icon-gallery">
          {AGENT_ICONS.map((icon, i) => (
            <li key={icon.name}>
              <AgentSprite color={PLATFORM_COLORS.monday} icon={i} size={30} />
              <span>{icon.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
