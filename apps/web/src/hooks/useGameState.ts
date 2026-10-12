import type { GameState, StreamEvent } from '@aj/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchState } from '../api/client.ts';

export const STATE_KEY = ['state'] as const;

export function applyEvent(state: GameState, event: StreamEvent): GameState {
  switch (event.type) {
    case 'agent':
      return { ...state, agents: upsert(state.agents, event.agent) };
    case 'location':
      return { ...state, locations: upsert(state.locations, event.location) };
    case 'turn': {
      const turns = upsert(state.turns, event.turn);
      turns.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return { ...state, turns };
    }
    case 'brain':
      return { ...state, brain: event.brain };
  }
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

/** Initial snapshot over REST, then live patches over SSE. */
export function useGameState() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: STATE_KEY, queryFn: fetchState, staleTime: Infinity });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onopen = () => {
      setConnected(true);
      // Catch up on anything missed while disconnected.
      void client.invalidateQueries({ queryKey: STATE_KEY });
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (msg: MessageEvent<string>) => {
      const event = JSON.parse(msg.data) as StreamEvent;
      const prev = client.getQueryData<GameState>(STATE_KEY);
      // A new agent arrives with history and buildings we don't have yet: reload the snapshot.
      if (event.type === 'agent' && prev && !prev.agents.some((a) => a.id === event.agent.id)) {
        void client.invalidateQueries({ queryKey: STATE_KEY });
        return;
      }
      client.setQueryData<GameState>(STATE_KEY, (state) => (state ? applyEvent(state, event) : state));
    };
    return () => source.close();
  }, [client]);

  return { ...query, connected };
}
