import type { ControlRequest, ControlResponse, GameState } from '@aj/shared';

export async function fetchState(): Promise<GameState> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json() as Promise<GameState>;
}

export async function sendControl(agentId: string, body: ControlRequest): Promise<ControlResponse> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({ ok: false, message: `Server returned ${res.status}` }))) as ControlResponse;
  if (!res.ok) throw new Error(json.message);
  return json;
}
