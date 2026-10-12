import type { Agent, ControlRequest } from '@aj/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { sendControl } from '../api/client.ts';
import { Modal } from './Modal.tsx';

export type ControlKind = 'pause' | 'resume' | 'triggerTurn' | 'assignGoal';

const TITLES: Record<ControlKind, string> = {
  pause: 'Pause agent',
  resume: 'Resume agent',
  triggerTurn: 'Run a turn now',
  assignGoal: 'Set goals',
};

/** Every control action is confirmed here first, because these hit live agents. */
export function ControlDialog({ agent, kind, onClose, onDone }: { agent: Agent; kind: ControlKind; onClose(): void; onDone(msg: string): void }) {
  const jobs = agent.jobs ?? [];
  const needsJob = agent.capabilities.perJob && (kind === 'assignGoal' || kind === 'triggerTurn');
  const [jobId, setJobId] = useState<string>(needsJob && kind === 'assignGoal' ? (jobs[0]?.id ?? '') : '');
  const job = jobs.find((j) => j.id === jobId);
  const [text, setText] = useState(kind === 'assignGoal' ? ((needsJob ? job?.instructions : agent.goal) ?? '') : '');

  const mutation = useMutation({
    mutationFn: (body: ControlRequest) => sendControl(agent.id, body),
    onSuccess: (res) => {
      onDone(res.message);
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: ControlRequest =
      kind === 'assignGoal'
        ? { action: 'assignGoal', text, jobId: jobId || undefined }
        : kind === 'triggerTurn'
          ? { action: 'triggerTurn', jobId: jobId || undefined, message: text || undefined }
          : { action: kind };
    mutation.mutate(body);
  };

  const canSubmit = !mutation.isPending && (kind !== 'assignGoal' || (text.trim() && (!needsJob || jobId)));

  return (
    <Modal title={`${TITLES[kind]}: ${agent.name}`} onClose={onClose} wide={kind === 'assignGoal'}>
      <form onSubmit={submit} className="control-form">
        {kind === 'pause' && <p>Stop {agent.name} from taking new turns? Runs in progress may still finish.</p>}
        {kind === 'resume' && <p>Let {agent.name} take turns again on its normal schedule?</p>}

        {needsJob && (
          <label className="field">
            <span>Job</span>
            <select
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                if (kind === 'assignGoal') setText(jobs.find((j) => j.id === e.target.value)?.instructions ?? '');
              }}
            >
              {kind === 'triggerTurn' && <option value="">Whole agent</option>}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                  {j.enabled ? '' : ' (disabled)'}
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === 'assignGoal' && (
          <label className="field">
            <span>{needsJob ? 'Job instructions (replaces the current text)' : 'Goal'}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} required />
          </label>
        )}

        {kind === 'triggerTurn' && agent.platform !== 'monday' && (
          <label className="field">
            <span>Message for this run (optional)</span>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
          </label>
        )}

        {agent.platform !== 'claude' && agent.platform !== 'cursor' && (
          <p className="warning">This is a live {agent.platform} agent. The change applies right away.</p>
        )}
        {mutation.isError && (
          <p className="error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="pixel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pixel-btn primary" disabled={!canSubmit}>
            {mutation.isPending ? 'Sending...' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
