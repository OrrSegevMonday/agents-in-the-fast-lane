# Agents in the Fast Lane

A *Jones in the Fast Lane*-style board for watching and steering agents across platforms.

- **Players** are agents: monday, Sphera, Claude, Cursor.
- **Buildings** are the places they work: repos, boards, tools, services.
- **A turn** is one cycle run of an agent. Scrub the clock or step turn by turn to replay what any agent did.
- **Meters** (Jones's four goals): Cost (wealth), Success (happiness), Knowledge (education, fed by the Team Brain), Output (career).
- **Team Brain** sits in the town square. It is a placeholder until the shared-context MCP exists.


## Run

Requires Node 22.13+ (`nvm use`).

```bash
npm install
npm run setup   # asks for your tokens, agents and boards; skip it to run on mock agents
npm run dev     # server :8787, web :5173
```

`npm run setup` writes your private values to two gitignored files:

- `.env`: API tokens, your monday account URL, agent ids, Sphera URLs and ids.
- `locations.local.json`: boards you pin as buildings, with their names.

Nothing account-specific lives in the code. You can also copy `.env.example` to `.env` and edit it by hand.

Other scripts: `npm test`, `npm run typecheck`, `npm run probe` (reports which run-history sources each live platform exposes).

## Adapters

| Platform | Status | Turns come from | Controls |
|---|---|---|---|
| monday | live (`MONDAY_API_TOKEN`, `MONDAY_AGENT_IDS`, `MONDAY_ACCOUNT_URL`) | Runs started here: exact tool calls from `tool_events`. History: board activity logs on the boards named in the agent's job instructions, grouped into turns by 15-minute gaps | Pause/Resume = deactivate/activate. Run turn = run agent or job. Set goals = replace a job's instructions |
| Sphera | live (`SPHERA_API_URL`, `SPHERA_AGENT_IDS`) | Probed history endpoint if one exists, else runs started here, filled from GitHub activity by `SPHERA_GITHUB_ACTOR` in the context repos | Pause/Resume = `enabled`. Run turn = `/trigger`. Set goals = PATCH `prompt` (owner-only prompts need `SPHERA_SESSION_COOKIE`) |
| Claude | mock | Deterministic generator | All, in memory |
| Cursor | mock | Deterministic generator | All, in memory |

Each turn shows where its data came from, so you know which turns are exact and which are inferred.

### monday notes

- Use the **agent id**, not the user id in the agent editor URL. `npm run setup` accepts the editor URL and converts it.
- Scheduled turns are matched to the job whose schedule they fall in. Tools that job's instructions use (Notetaker, Slack, Calendar) are added as **inferred** visits, drawn dashed.
- Personal agents write to boards **as their owner**, so their history is inferred from the owner's activity on the agent's boards. That can include your own manual edits.
- monday's schema has an `AgentActivityRun` type but no query exposes it yet. `npm run probe` will report when one does.

## Layout

```
packages/shared   domain types, meters, control schema
apps/server       Fastify API, adapters, poller, SQLite store (node:sqlite), SSE
apps/web          React board, player panel, turn inspector, dialogs
```

Add a platform by implementing `AgentAdapter` (`apps/server/src/adapters/types.ts`) and registering it in `adapters/index.ts`. Generic buildings live in `apps/server/src/config/locations.ts`. Your own boards and repos go in `locations.local.json`. Unknown locations are placed automatically.

## Security

Tokens and cookies are read from `.env` on the server only. They are never logged or sent to the browser. The server binds to `127.0.0.1`. Every control action asks for confirmation in the UI.

## Music

No music ships with the repo. To get background music, put an mp3 you have the rights to in `media/` (gitignored). The first file alphabetically plays on loop, and a Sound on/off button appears in the top bar.

## Credits

- **Game design inspiration:** [openjones](https://github.com/dimidd/openjones) by [Dimid Duchovny](https://github.com/dimidd), an open-source take on *Jones in the Fast Lane*. The town grid, routes, timed actions and goal meters here are re-implemented from its ideas. No code or art is copied. openjones does not state a license or attribution terms, so this is a thank-you rather than a license notice.
- ***Jones in the Fast Lane*** was published by Sierra On-Line (1990). This project is an unofficial homage and is not affiliated with its rights holders.
- **Music discovery:** game soundtracks were browsed on [KHInsider](https://downloads.khinsider.com/). KHInsider grants no license to reuse its tracks, and they remain the property of their rights holders, so none are included here.
