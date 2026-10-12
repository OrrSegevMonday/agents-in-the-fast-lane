import { AGENT_ICON_COUNT } from '@aj/shared';
import { describe, expect, it } from 'vitest';
import { AGENT_ICONS, iconFor } from '../src/lib/agentIcons.ts';

describe('agent icons', () => {
  it('has one well-formed hat per icon slot', () => {
    expect(AGENT_ICONS).toHaveLength(AGENT_ICON_COUNT);
    for (const icon of AGENT_ICONS) {
      expect(icon.hat).toHaveLength(4);
      for (const row of icon.hat) expect(row).toMatch(/^[kcyw.]{8}$/);
    }
  });

  it('gives every icon a unique shape and name', () => {
    expect(new Set(AGENT_ICONS.map((i) => i.hat.join('|'))).size).toBe(AGENT_ICON_COUNT);
    expect(new Set(AGENT_ICONS.map((i) => i.name)).size).toBe(AGENT_ICON_COUNT);
  });

  it('falls back to the first icon and wraps out-of-range numbers', () => {
    expect(iconFor(undefined)).toBe(AGENT_ICONS[0]);
    expect(iconFor(AGENT_ICON_COUNT + 1)).toBe(AGENT_ICONS[1]);
  });
});
