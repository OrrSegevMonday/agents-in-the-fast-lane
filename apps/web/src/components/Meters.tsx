import { meterProgress, type Meters as MeterValues } from '@aj/shared';

const METERS: { key: keyof MeterValues; label: string; jones: string; format(v: number): string; color: string }[] = [
  { key: 'cost', label: 'Cost', jones: 'Wealth', format: (v) => `$${v.toFixed(2)}`, color: '#ffd166' },
  { key: 'success', label: 'Success', jones: 'Happiness', format: (v) => `${v}%`, color: '#06d6a0' },
  { key: 'knowledge', label: 'Knowledge', jones: 'Education', format: (v) => `${v}`, color: '#ff8fab' },
  { key: 'output', label: 'Output', jones: 'Career', format: (v) => `${v}`, color: '#3a86ff' },
];

export function Meters({ values, goals, compact }: { values: MeterValues; goals: MeterValues; compact?: boolean }) {
  return (
    <ul className={`meters${compact ? ' compact' : ''}`}>
      {METERS.map((m) => {
        const progress = meterProgress(values[m.key], goals[m.key]);
        const over = m.key === 'cost' && values.cost > goals.cost;
        return (
          <li key={m.key} className="meter">
            <span className="meter-label" title={`${m.jones} in Jones`}>
              {m.label}
            </span>
            <span
              className="meter-bar"
              role="meter"
              aria-label={`${m.label}${m.key === 'cost' ? ' (budget used)' : ''}`}
              aria-valuemin={0}
              aria-valuemax={goals[m.key]}
              aria-valuenow={values[m.key]}
              aria-valuetext={`${m.format(values[m.key])} of ${m.format(goals[m.key])}`}
            >
              <span className="meter-fill" style={{ width: `${progress * 100}%`, background: over ? '#e63946' : m.color }} />
            </span>
            {!compact && (
              <span className="meter-value">
                {m.format(values[m.key])}
                <span className="meter-goal"> / {m.format(goals[m.key])}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
