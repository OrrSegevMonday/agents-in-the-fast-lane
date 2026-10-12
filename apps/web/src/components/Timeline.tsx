import type { Turn } from '@aj/shared';
import { formatClock } from '../lib/format.ts';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** The game clock: live follows now; drag back and let go to replay forward from there. */
export function Timeline({
  min,
  max,
  at,
  live,
  playing,
  speed,
  turns,
  onScrub,
  onScrubEnd,
  onLive,
  onTogglePlay,
  onSpeed,
}: {
  min: number;
  max: number;
  at: number;
  live: boolean;
  playing: boolean;
  speed: Speed;
  turns: Turn[];
  onScrub(at: number): void;
  onScrubEnd(): void;
  onLive(): void;
  onTogglePlay(): void;
  onSpeed(speed: Speed): void;
}) {
  const span = Math.max(max - min, 1);
  return (
    <div className="timeline">
      <button type="button" className={`pixel-btn small${live ? ' primary' : ''}`} onClick={onLive} aria-pressed={live}>
        {live ? 'LIVE' : 'Go live'}
      </button>
      {!live && (
        <>
          <button type="button" className="pixel-btn small" onClick={onTogglePlay} aria-label={playing ? 'Pause replay' : 'Play replay'}>
            {playing ? '||' : '>'}
          </button>
          <button
            type="button"
            className="pixel-btn small"
            onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
            aria-label={`Replay speed ${speed}x. Change speed.`}
          >
            {speed}x
          </button>
        </>
      )}
      <div className="timeline-track">
        <div className="timeline-ticks" aria-hidden="true">
          {turns.map((t) => (
            <span
              key={t.id}
              className={`tick status-${t.status}`}
              style={{ left: `${((Date.parse(t.startedAt) - min) / span) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1000}
          value={Math.min(Math.max(at, min), max)}
          onChange={(e) => onScrub(Number(e.target.value))}
          onPointerUp={onScrubEnd}
          onKeyUp={onScrubEnd}
          aria-label="Game clock. Drag back and release to replay."
          aria-valuetext={formatClock(at, true)}
        />
      </div>
      <time className="clock" dateTime={new Date(at).toISOString()}>
        {formatClock(at, true)}
      </time>
    </div>
  );
}
