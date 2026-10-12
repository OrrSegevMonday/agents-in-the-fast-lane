import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../src/setup/registry.ts';
import { ensureEnvFile, ensureGitignored, formatEnvValue, setEnvValue } from '../src/setup/envFile.ts';
import { parseAgentUrl } from '../src/setup/resolveAgent.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'aj-setup-'));

describe('envFile', () => {
  it('creates .env from the example with private permissions, once', () => {
    const d = dir();
    writeFileSync(join(d, '.env.example'), 'A=1\n');
    expect(ensureEnvFile(join(d, '.env'), join(d, '.env.example'))).toBe(true);
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe('A=1\n');
    expect(statSync(join(d, '.env')).mode & 0o777).toBe(0o600);
    expect(ensureEnvFile(join(d, '.env'), join(d, '.env.example'))).toBe(false);
  });

  it('replaces a key in place and appends missing ones, keeping other lines', () => {
    const p = join(dir(), '.env');
    writeFileSync(p, '# note\nA=1\nTOKEN=\nB=2\n');
    setEnvValue(p, 'TOKEN', 'abc');
    setEnvValue(p, 'NEW', 'x');
    expect(readFileSync(p, 'utf8')).toBe('# note\nA=1\nTOKEN=abc\nB=2\nNEW=x\n');
  });

  it('quotes values that need it and rejects line breaks', () => {
    expect(formatEnvValue('a b;c=d')).toBe('"a b;c=d"');
    expect(formatEnvValue('say "hi"')).toBe(`'say "hi"'`);
    expect(() => formatEnvValue('a\nb')).toThrow();
  });

  it('adds .env to .gitignore only when missing', () => {
    const p = join(dir(), '.gitignore');
    writeFileSync(p, 'node_modules');
    expect(ensureGitignored(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).toBe('node_modules\n.env\n');
    expect(ensureGitignored(p)).toBe(false);
  });
});

describe('parseAgentUrl', () => {
  it('recognises monday agent editor links', () => {
    expect(parseAgentUrl('https://acme.monday.com/ai_agents/user/42/editor')).toEqual({
      platform: 'monday',
      userId: '42',
      origin: 'https://acme.monday.com',
    });
  });
  it('recognises Sphera links by configured base or /agents/ path', () => {
    const base = 'https://s.example.com/builders/agents';
    expect(parseAgentUrl(`${base}/77?tab=x`, base)).toEqual({ platform: 'sphera', nativeId: '77' });
    expect(parseAgentUrl('https://s.example.com/x/agents/9')).toEqual({ platform: 'sphera', nativeId: '9' });
  });
  it('rejects unknown links', () => {
    expect(parseAgentUrl('https://example.com/')).toBeUndefined();
  });
});

describe('AgentRegistry', () => {
  const memory = () => {
    const m = new Map<string, unknown>();
    return { getKv: <T,>(k: string) => m.get(k) as T | undefined, setKv: (k: string, v: unknown) => void m.set(k, v) };
  };
  const agent = (n: string) => ({ id: `monday:${n}`, platform: 'monday' as const, nativeId: n, url: '', enabled: true });

  it('seeds once, then disable keeps the entry but drops it from enabled ids', () => {
    const kv = memory();
    const reg = new AgentRegistry(kv, [agent('1'), agent('2')]);
    expect(new AgentRegistry(kv, [agent('9')]).list()).toHaveLength(2);
    reg.setEnabled('monday:1', false);
    expect(reg.list()).toHaveLength(2);
    expect(reg.enabledIds('monday')).toEqual(['2']);
  });

  it('delete removes the entry', () => {
    const reg = new AgentRegistry(memory(), [agent('1')]);
    reg.remove('monday:1');
    expect(reg.get('monday:1')).toBeUndefined();
  });
});
