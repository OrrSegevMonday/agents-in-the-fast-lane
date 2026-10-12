import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native <dialog>: focus trapping, Escape and the backdrop come from the browser. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // No close() on cleanup: it fires the close event, which would unmount us again under
  // StrictMode's double effect. Unmounting removes the dialog from the top layer anyway.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-frame">
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="pixel-btn small" onClick={onClose} aria-label="Close">
            X
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
