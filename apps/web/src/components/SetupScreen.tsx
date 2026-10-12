import type { SetupAgent, SetupSecret, SetupState } from '@aj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { addAgent, deleteAgent, fetchSetup, saveSecret, setAgentEnabled } from '../api/client.ts';
import { PLATFORM_LABEL } from '../lib/board.ts';
import { Modal } from './Modal.tsx';

export const SETUP_KEY = ['setup'] as const;

export function SetupScreen({ onBack, onDone }: { onBack(): void; onDone(msg: string): void }) {
  const { data, error } = useQuery({ queryKey: SETUP_KEY, queryFn: fetchSetup });
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: SETUP_KEY });
    void client.invalidateQueries({ queryKey: ['state'] });
  };

  return (
    <main className="setup">
      <div className="setup-head">
        <h2>Setup</h2>
        <button type="button" className="pixel-btn" onClick={onBack}>
          Back to the board
        </button>
      </div>
      {data?.firstRun && (
        <p className="panel">
          Welcome! Add a key for each system you use, then paste an agent link. Keys are saved only in your local
          .env file, which git ignores.
        </p>
      )}
      {error && <p className="error">{error.message}</p>}
      {data && (
        <>
          <section className="panel" aria-labelledby="setup-keys">
            <h3 id="setup-keys">Keys and tokens</h3>
            <ul className="setup-list">
              {data.secrets.map((s) => (
                <SecretRow key={s.key} secret={s} onSaved={(msg) => (refresh(), onDone(msg))} />
              ))}
            </ul>
          </section>
          <AgentsPanel state={data} onChanged={refresh} onDone={onDone} />
        </>
      )}
    </main>
  );
}

function SecretRow({ secret, onSaved }: { secret: SetupSecret; onSaved(msg: string): void }) {
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: () => saveSecret(secret.key, value),
    onSuccess: () => {
      setValue('');
      onSaved(`${secret.label} saved`);
    },
  });
  return (
    <li>
      <form
        className="setup-row"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="field">
          <span>
            {secret.label} <code className="secret-mask">{secret.isSet ? '*****' : 'not set'}</code>
          </span>
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={secret.isSet ? 'Enter a new value to replace' : 'Paste it here'}
          />
          <small className="muted">{secret.hint}</small>
        </label>
        <button type="submit" className="pixel-btn primary small" disabled={!value || save.isPending}>
          {secret.isSet ? 'Replace' : 'Save'}
        </button>
      </form>
      {save.error && <p className="error" role="alert">{save.error.message}</p>}
    </li>
  );
}

function AgentsPanel({ state, onChanged, onDone }: { state: SetupState; onChanged(): void; onDone(msg: string): void }) {
  const [url, setUrl] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<SetupAgent>();
  const add = useMutation({
    mutationFn: () => addAgent(url.trim()),
    onSuccess: (agent) => {
      setUrl('');
      onChanged();
      onDone(`Added ${agent.name}`);
    },
  });
  const toggle = useMutation({
    mutationFn: (a: SetupAgent) => setAgentEnabled(a.id, !a.enabled),
    onSuccess: (a) => {
      onChanged();
      onDone(a.enabled ? `Tracking ${a.name}` : `Stopped tracking ${a.name}`);
    },
  });
  const remove = useMutation({
    mutationFn: (a: SetupAgent) => deleteAgent(a.id),
    onSuccess: (_, a) => {
      setConfirmDelete(undefined);
      onChanged();
      onDone(`Deleted ${a.name}`);
    },
  });

  return (
    <section className="panel" aria-labelledby="setup-agents">
      <h3 id="setup-agents">Agents</h3>
      <form
        className="setup-row"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <label className="field">
          <span>Agent URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-account.monday.com/ai_agents/user/123/editor"
          />
        </label>
        <button type="submit" className="pixel-btn primary small" disabled={!url.trim() || add.isPending}>
          {add.isPending ? 'Setting up...' : 'Add agent'}
        </button>
      </form>
      {add.error && <p className="error" role="alert">{add.error.message}</p>}
      {toggle.error && <p className="error" role="alert">{toggle.error.message}</p>}

      {state.agents.length === 0 ? (
        <p className="muted">No agents yet.</p>
      ) : (
        <ul className="setup-list">
          {state.agents.map((a) => (
            <li key={a.id} className={`setup-agent${a.enabled ? '' : ' disabled'}`}>
              <span className="setup-agent-name">
                {a.name}
                <span className="muted">
                  {' '}
                  {PLATFORM_LABEL[a.platform]} · {a.enabled ? (a.syncError ? 'offline' : (a.status ?? 'connecting')) : 'disabled'}
                </span>
              </span>
              <span className="setup-actions">
                <button type="button" className="pixel-btn small" onClick={() => toggle.mutate(a)} disabled={toggle.isPending}>
                  {a.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="pixel-btn small" onClick={() => setConfirmDelete(a)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <Modal title={`Delete ${confirmDelete.name}?`} onClose={() => setConfirmDelete(undefined)}>
          <p>This removes the agent and all its saved settings and history from this app. The agent itself is untouched.</p>
          <p className="muted">To keep the settings and just stop tracking, use Disable instead.</p>
          {remove.error && <p className="error" role="alert">{remove.error.message}</p>}
          <div className="form-actions">
            <button type="button" className="pixel-btn" onClick={() => setConfirmDelete(undefined)}>
              Cancel
            </button>
            <button type="button" className="pixel-btn primary" disabled={remove.isPending} onClick={() => remove.mutate(confirmDelete)}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
