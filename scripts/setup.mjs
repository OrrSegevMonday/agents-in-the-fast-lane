#!/usr/bin/env node
// First-run setup: asks for your private values and writes them to gitignored files
// (.env and locations.local.json). Re-run any time; current values are the defaults.

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const EXAMPLE_PATH = resolve(ROOT, '.env.example');
const LOCATIONS_PATH = resolve(ROOT, 'locations.local.json');
const MONDAY_API = 'https://api.monday.com/v2';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
  else if (s.includes('\n')) rl.output.write('\n');
};

// Queue input lines ourselves so answers typed (or piped) ahead of the prompt are kept.
const lines = [];
const waiting = [];
let closed = false;
rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
rl.on('close', () => {
  closed = true;
  while (waiting.length) waiting.shift()('');
});
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve('') : new Promise((r) => waiting.push(r)));

async function ask(question, fallback = '') {
  const hint = fallback ? ` [${fallback}]` : '';
  rl.output.write(`${question}${hint}: `);
  const answer = (await nextLine()).trim();
  if (!process.stdin.isTTY) rl.output.write('\n');
  return answer || fallback;
}

/** Input is not echoed. Enter keeps the current value. */
async function askSecret(question, current) {
  const hint = current ? ' [keep current]' : '';
  rl.output.write(`${question}${hint}: `);
  muted = true;
  const answer = (await nextLine()).trim();
  muted = false;
  if (!process.stdin.isTTY) rl.output.write('\n');
  return answer || current;
}

async function askYesNo(question, fallback) {
  const a = (await ask(`${question} (y/n)`, fallback ? 'y' : 'n')).toLowerCase();
  return a.startsWith('y');
}

function readEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Writes values into the .env.example layout so comments and order are kept. */
function writeEnv(values) {
  const template = readFileSync(EXAMPLE_PATH, 'utf8');
  const seen = new Set();
  const body = template
    .split('\n')
    .map((line) => {
      const m = line.match(/^([A-Z0-9_]+)=/);
      if (!m) return line;
      seen.add(m[1]);
      return `${m[1]}=${values[m[1]] ?? ''}`;
    })
    .join('\n');
  const extra = Object.keys(values).filter((k) => !seen.has(k));
  writeFileSync(ENV_PATH, body + (extra.length ? `\n${extra.map((k) => `${k}=${values[k]}`).join('\n')}\n` : ''));
  chmodSync(ENV_PATH, 0o600);
}

async function monday(token, query, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

/** Accepts agent ids or agent editor URLs (which carry the agent's user id) and returns agent ids. */
async function resolveAgentIds(token, input) {
  const ids = [];
  for (const raw of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const fromUrl = raw.match(/ai_agents\/user\/(\d+)/);
    if (!fromUrl) {
      ids.push(raw);
      continue;
    }
    const { users } = await monday(token, 'query($ids:[ID!]) { users(ids: $ids) { email } }', { ids: [fromUrl[1]] });
    const agent = users[0]?.email?.match(/^agent-(\d+)@/);
    if (!agent) throw new Error(`User ${fromUrl[1]} is not an agent user`);
    console.log(`  ${raw} -> agent ${agent[1]}`);
    ids.push(agent[1]);
  }
  return ids.join(',');
}

async function pinBoards(token, input, accountUrl) {
  const ids = input.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return;
  const { boards } = await monday(token, 'query($ids:[ID!]) { boards(ids: $ids) { id name } }', { ids });
  const existing = existsSync(LOCATIONS_PATH) ? JSON.parse(readFileSync(LOCATIONS_PATH, 'utf8')) : [];
  const others = existing.filter((l) => l.kind !== 'board');
  const freeSlots = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15];
  const pinned = boards.map((b, i) => ({
    kind: 'board',
    ref: b.id,
    name: b.name,
    ...(accountUrl ? { url: `${accountUrl}/boards/${b.id}` } : {}),
    ...(freeSlots[i] !== undefined ? { slot: freeSlots[i] } : {}),
    pinned: true,
  }));
  writeFileSync(LOCATIONS_PATH, `${JSON.stringify([...pinned, ...others], null, 2)}\n`);
  console.log(`  pinned ${pinned.map((p) => p.name).join(', ')} in locations.local.json`);
}

async function main() {
  console.log('\nAgents in the Fast Lane: setup');
  console.log('Values go to .env and locations.local.json, both gitignored.\n');
  const env = { ...readEnv(EXAMPLE_PATH), ...readEnv(ENV_PATH) };

  if (await askYesNo('Connect monday agents?', Boolean(env.MONDAY_API_TOKEN))) {
    env.MONDAY_API_TOKEN = await askSecret('monday API token (Avatar > Developers > My access tokens)', env.MONDAY_API_TOKEN);
    try {
      const { me } = await monday(env.MONDAY_API_TOKEN, 'query { me { name account { slug } } }');
      console.log(`  connected as ${me.name}`);
      env.MONDAY_ACCOUNT_URL = await ask('Account URL', env.MONDAY_ACCOUNT_URL || `https://${me.account.slug}.monday.com`);
      env.MONDAY_AGENT_IDS = await resolveAgentIds(
        env.MONDAY_API_TOKEN,
        await ask('Agent ids or agent editor URLs, comma separated', env.MONDAY_AGENT_IDS),
      );
      await pinBoards(
        env.MONDAY_API_TOKEN,
        await ask('Board ids to pin as buildings (optional, comma separated)'),
        env.MONDAY_ACCOUNT_URL,
      );
    } catch (err) {
      console.log(`  could not reach monday (${err.message}). Saving what you entered.`);
      env.MONDAY_ACCOUNT_URL = await ask('Account URL, e.g. https://your-account.monday.com', env.MONDAY_ACCOUNT_URL);
      env.MONDAY_AGENT_IDS = await ask('Agent ids, comma separated', env.MONDAY_AGENT_IDS);
    }
  }

  if (await askYesNo('Connect Sphera agents?', Boolean(env.SPHERA_AGENT_IDS))) {
    env.SPHERA_API_URL = await ask('Sphera Agent Factory API base URL (ends in /v2)', env.SPHERA_API_URL);
    env.SPHERA_UI_URL = await ask('Sphera agent page base URL (for links)', env.SPHERA_UI_URL);
    env.SPHERA_AGENT_IDS = await ask('Sphera agent ids, comma separated', env.SPHERA_AGENT_IDS);
    env.SPHERA_SESSION_COOKIE = await askSecret('Sphera session cookie (optional, for owner-only prompts)', env.SPHERA_SESSION_COOKIE);
    env.SPHERA_GITHUB_ACTOR = await ask('GitHub login of the Sphera bot (optional)', env.SPHERA_GITHUB_ACTOR);
    if (env.SPHERA_GITHUB_ACTOR) env.GITHUB_TOKEN = await askSecret('Read-only GitHub token', env.GITHUB_TOKEN);
  }

  const hasLive = Boolean(env.MONDAY_AGENT_IDS || env.SPHERA_AGENT_IDS);
  env.MOCK_AGENTS = (await askYesNo('Show mock Claude and Cursor agents?', env.MOCK_AGENTS ? env.MOCK_AGENTS === 'true' : !hasLive))
    ? 'true'
    : 'false';
  env.TEAM_BRAIN_MCP_URL = await ask('Team Brain MCP URL (optional, not wired yet)', env.TEAM_BRAIN_MCP_URL);

  writeEnv(env);
  console.log('\nSaved .env. Start the app with: npm run dev\n');
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
