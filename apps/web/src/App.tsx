import type { AgentAction, Turn } from '@aj/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSetup } from './api/client.ts';
import { Board } from './components/Board.tsx';
import { Legend } from './components/Legend.tsx';
import { BuildingInterior } from './components/BuildingInterior.tsx';
import { ControlDialog, type ControlKind } from './components/ControlDialog.tsx';
import { SetupScreen, SETUP_KEY } from './components/SetupScreen.tsx';
import { PlayerPanel } from './components/PlayerPanel.tsx';
import { Roster } from './components/Roster.tsx';
import { Timeline, type Speed } from './components/Timeline.tsx';
import { TurnInspector } from './components/TurnInspector.tsx';
import { useBackgroundMusic } from './hooks/useBackgroundMusic.ts';
import { useGameState } from './hooks/useGameState.ts';
import { actionTimeline, lastActionAt, nextActionTime, turnAt } from './lib/board.ts';

const EMPTY: Turn[] = [];
/** Time per replay step at 1x: long enough for a token to walk the ring between buildings. */
const REPLAY_STEP_MS = 1600;

export function App() {
  const { data, isLoading, error, connected } = useGameState();
  const sound = useBackgroundMusic();
  const [live, setLive] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [cursor, setCursor] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string>();
  const [openLocationId, setOpenLocationId] = useState<string>();
  const [showLegend, setShowLegend] = useState(false);
  const [control, setControl] = useState<ControlKind>();
  const [toast, setToast] = useState<string>();
  const [view, setView] = useState<'board' | 'setup'>('board');
  // First use: open Setup once, so there is somewhere to add keys and agents.
  const setupInfo = useQuery({ queryKey: SETUP_KEY, queryFn: fetchSetup });
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (setupInfo.data?.firstRun && !autoOpened) {
      setAutoOpened(true);
      setView('setup');
    }
  }, [setupInfo.data?.firstRun, autoOpened]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const at = live ? now : cursor;
  const agents = data?.agents ?? [];
  const turns = data?.turns ?? EMPTY;
  const locations = data?.locations ?? [];

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const turnsByAgent = useMemo(() => {
    const map = new Map<string, Turn[]>();
    for (const turn of turns) map.set(turn.agentId, [...(map.get(turn.agentId) ?? []), turn]);
    return map;
  }, [turns]);

  const current = useMemo(() => {
    const map = new Map<string, AgentAction | undefined>();
    for (const agent of agents) map.set(agent.id, lastActionAt(turnsByAgent.get(agent.id) ?? EMPTY, at));
    return map;
  }, [agents, turnsByAgent, at]);

  const selectedTurns = (selected && turnsByAgent.get(selected.id)) || EMPTY;
  const currentTurn = turnAt(selectedTurns, at);
  const turnNumber = currentTurn ? selectedTurns.indexOf(currentTurn) + 1 : 0;
  const minTime = turns.length ? Date.parse(turns[0]!.startedAt) : now - 3_600_000;
  const timeline = useMemo(() => actionTimeline(turns), [turns]);

  // Replay: jump from action to action, so tokens walk the board in order, then rejoin live.
  useEffect(() => {
    if (!playing || live) return;
    const timer = setInterval(() => {
      const next = nextActionTime(timeline, cursorRef.current);
      if (next === undefined) {
        setPlaying(false);
        setLive(true);
        return;
      }
      setCursor(next);
    }, REPLAY_STEP_MS / speed);
    return () => clearInterval(timer);
  }, [playing, live, speed, timeline]);

  const goTo = (time: number) => {
    setPlaying(false);
    setLive(false);
    setCursor(time);
  };

  const jumpToAction = (agentId: string, action: AgentAction) => {
    setSelectedId(agentId);
    setOpenLocationId(undefined);
    goTo(Date.parse(action.startedAt));
  };

  const stepTurn = (delta: -1 | 1) => {
    const target = selectedTurns[turnNumber - 1 + delta];
    if (target) goTo(Date.parse(target.actions[0]?.startedAt ?? target.startedAt));
  };

  if (isLoading) return <div className="splash">Loading the town...</div>;
  if (error) return <div className="splash error">Can&apos;t reach the server: {error.message}</div>;

  const openLocation = openLocationId ? locationsById.get(openLocationId) : undefined;
  const annex = locations.filter((l) => l.slot === null && l.kind !== 'brain');

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Agents <span>in the</span> Fast Lane
        </h1>
        <Timeline
          min={minTime}
          max={now}
          at={at}
          live={live}
          turns={selectedTurns}
          playing={playing}
          speed={speed}
          onScrub={goTo}
          onScrubEnd={() => {
            if (cursorRef.current < Date.now() - 1000) setPlaying(true);
          }}
          onLive={() => {
            setPlaying(false);
            setLive(true);
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSpeed={setSpeed}
        />
        <div className="topbar-status">
          {sound.available && (
            <button
              type="button"
              className={`pill sound-pill${sound.enabled ? ' on' : ''}`}
              onClick={sound.toggle}
              aria-pressed={sound.enabled}
              aria-label="Background music"
            >
              Sound: {sound.enabled ? 'on' : 'off'}
            </button>
          )}
          <span className={`pill ${connected ? 'ok' : 'bad'}`}>{connected ? 'stream on' : 'stream off'}</span>
          <button type="button" className="pill" onClick={() => setView(view === 'setup' ? 'board' : 'setup')}>
            {view === 'setup' ? 'Board' : 'Setup'}
          </button>
          <button type="button" className="pill brain-pill" onClick={() => setOpenLocationId('brain:team-brain')}>
            Team Brain: {data?.brain.connected ? 'on' : 'soon'}
          </button>
        </div>
      </header>

      {view === 'setup' && <SetupScreen onBack={() => setView('board')} onDone={setToast} />}

      <main className="layout" hidden={view === 'setup'}>
        <div className="left-col">
          <button type="button" className="pixel-btn legend-btn" onClick={() => setShowLegend(true)} aria-haspopup="dialog">
            Legend
          </button>
          <Roster agents={agents} turnsByAgent={turnsByAgent} at={at} selectedId={selected?.id} onSelect={setSelectedId} />
        </div>

        <div className="board-col">
          <Board
            agents={agents}
            locations={locations}
            current={current}
            selectedAgentId={selected?.id}
            animate
            onSelectAgent={setSelectedId}
            onOpenLocation={setOpenLocationId}
          />
          {annex.length > 0 && (
            <div className="annex">
              <h2>Annex</h2>
              <ul>
                {annex.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="pixel-btn small" onClick={() => setOpenLocationId(l.id)}>
                      {l.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="side">
          {selected ? (
            <>
              <PlayerPanel agent={selected} turns={selectedTurns} at={at} onControl={setControl} />
              <TurnInspector
                turn={currentTurn}
                turnNumber={turnNumber}
                totalTurns={selectedTurns.length}
                locations={locationsById}
                currentActionId={current.get(selected.id)?.id}
                onJump={(action) => jumpToAction(selected.id, action)}
                onStep={stepTurn}
              />
            </>
          ) : (
            <section className="panel">
              <p>No agents yet. Configure an adapter in .env (see README).</p>
            </section>
          )}
        </aside>
      </main>

      {openLocation && data && (
        <BuildingInterior
          location={openLocation}
          turns={turns}
          agents={agentsById}
          at={at}
          brain={data.brain}
          onClose={() => setOpenLocationId(undefined)}
          onJump={jumpToAction}
        />
      )}

      {showLegend && <Legend locations={locations} onClose={() => setShowLegend(false)} />}

      {control && selected && (
        <ControlDialog agent={selected} kind={control} onClose={() => setControl(undefined)} onDone={setToast} />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
