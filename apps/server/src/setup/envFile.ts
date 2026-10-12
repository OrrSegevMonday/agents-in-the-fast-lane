import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const QUOTES = ['"', "'", '`'];

/** Format a value so Node's --env-file parser reads it back unchanged. */
export function formatEnvValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Value cannot contain line breaks');
  if (!/[\s#"'`\\]/.test(value)) return value;
  const quote = QUOTES.find((q) => !value.includes(q));
  if (!quote) throw new Error('Value cannot contain all of " \' and `');
  return `${quote}${value}${quote}`;
}

/** Replace `KEY=...` in place, or append it. Everything else in the file is left alone. */
export function setEnvValue(path: string, key: string, value: string) {
  const line = `${key}=${formatEnvValue(value)}`;
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i === -1) {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(line, '');
  } else lines[i] = line;
  writeFileSync(path, lines.join('\n'), { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** First use: create `.env` from the example (it holds no secrets). Returns true if it was created. */
export function ensureEnvFile(path: string, examplePath: string): boolean {
  if (existsSync(path)) return false;
  if (existsSync(examplePath)) copyFileSync(examplePath, path);
  else writeFileSync(path, '');
  chmodSync(path, 0o600);
  return true;
}

/** Safety net so a real `.env` can never be committed. Returns true if it had to add the entry. */
export function ensureGitignored(gitignorePath: string, entry = '.env'): boolean {
  const text = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  if (text.split('\n').some((l) => l.trim() === entry)) return false;
  writeFileSync(gitignorePath, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${entry}\n`);
  return true;
}
