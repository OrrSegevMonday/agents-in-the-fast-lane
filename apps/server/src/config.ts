const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: num(process.env.API_PORT, 8787),
  host: process.env.API_HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || './data/agents-jones.sqlite',
  monday: {
    token: process.env.MONDAY_API_TOKEN || '',
    /** Your account's web address, used for links, e.g. https://your-account.monday.com */
    accountUrl: (process.env.MONDAY_ACCOUNT_URL || '').replace(/\/+$/, ''),
    apiUrl: process.env.MONDAY_API_URL || 'https://api.monday.com/v2',
    mcpUrl: process.env.MONDAY_MCP_URL || 'https://mcp.monday.com/mcp',
    agentIds: list(process.env.MONDAY_AGENT_IDS),
    pollSeconds: num(process.env.MONDAY_POLL_SECONDS, 120),
  },
  sphera: {
    apiUrl: (process.env.SPHERA_API_URL || '').replace(/\/+$/, ''),
    /** Web UI base for agent links, e.g. https://sphera.example.com/agentic-builders/agents */
    uiUrl: (process.env.SPHERA_UI_URL || '').replace(/\/+$/, ''),
    agentIds: list(process.env.SPHERA_AGENT_IDS),
    sessionCookie: process.env.SPHERA_SESSION_COOKIE || '',
    githubActor: process.env.SPHERA_GITHUB_ACTOR || '',
    githubToken: process.env.GITHUB_TOKEN || '',
    pollSeconds: num(process.env.SPHERA_POLL_SECONDS, 120),
  },
  mockAgents: process.env.MOCK_AGENTS !== 'false',
  brainUrl: process.env.TEAM_BRAIN_MCP_URL || '',
  /** Optional private building names and slots, written by `npm run setup`. */
  locationsFile: process.env.LOCATIONS_FILE || '../../locations.local.json',
};

export type Config = typeof config;
