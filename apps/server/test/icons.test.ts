import { AGENT_ICON_COUNT } from '@aj/shared';
import { describe, expect, it } from 'vitest';
import { IconRegistry } from '../src/icons.ts';
import { Store } from '../src/store/sqlite.ts';

const agent = (platform: 'monday' | 'claude', n: number) => ({ id: `${platform}:${n}`, platform });

describe('IconRegistry', () => {
  it('gives same-platform agents different icons, and other platforms start over', () => {
    const icons = new IconRegistry(new Store(':memory:'));
    expect([1, 2, 3].map((n) => icons.assign(agent('monday', n)))).toEqual([0, 1, 2]);
    expect(icons.assign(agent('claude', 1))).toBe(0);
  });

  it('keeps an icon forever, even as other agents come and go', () => {
    const store = new Store(':memory:');
    const icons = new IconRegistry(store);
    icons.assign(agent('monday', 1));
    const second = icons.assign(agent('monday', 2));
    store.deleteAgent('monday:1');
    expect(icons.assign(agent('monday', 2))).toBe(second);
    // The freed icon goes to the next newcomer.
    expect(icons.assign(agent('monday', 3))).toBe(0);
  });

  it('wraps around once a platform has more agents than icons', () => {
    const icons = new IconRegistry(new Store(':memory:'));
    const all = Array.from({ length: AGENT_ICON_COUNT + 2 }, (_, n) => icons.assign(agent('monday', n)));
    expect(new Set(all.slice(0, AGENT_ICON_COUNT)).size).toBe(AGENT_ICON_COUNT);
    expect(all.slice(AGENT_ICON_COUNT)).toEqual([0, 1]);
  });
});
