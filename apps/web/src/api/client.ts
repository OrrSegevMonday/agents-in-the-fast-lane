import type { ControlRequest, ControlResponse, GameState, SetupAgent, SetupState } from '@aj/shared';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Server returned ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const fetchSetup = () => request<SetupState>('/api/setup');
export const saveSecret = (key: string, value: string) =>
  request<void>(`/api/setup/secrets/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
export const addAgent = (url: string) =>
  request<SetupAgent>('/api/setup/agents', { method: 'POST', body: JSON.stringify({ url }) });
export const setAgentEnabled = (id: string, enabled: boolean) =>
  request<SetupAgent>(`/api/setup/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
export const deleteAgent = (id: string) =>
  request<void>(`/api/setup/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
