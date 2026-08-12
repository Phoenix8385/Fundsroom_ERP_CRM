import { useEffect, type ReactNode } from 'react';

function useDismissOnEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}

interface OverlayProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centred dialog, for forms and confirmations. */
export function Modal({ title, onClose, children, footer }: OverlayProps) {
  useDismissOnEscape(onClose);

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="overlay__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="overlay__body">{children}</div>
        {footer ? <footer className="overlay__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Right-hand panel, for record detail alongside the list it came from. */
export function Drawer({ title, onClose, children, footer }: OverlayProps) {
  useDismissOnEscape(onClose);

  return (
    <div className="scrim scrim--right" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="overlay__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="overlay__body">{children}</div>
        {footer ? <footer className="overlay__foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span className="pagination__count">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="pagination__page">
          Page {page} of {lastPage}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onPage(page + 1)}
          disabled={page >= lastPage}
        >
          Next
        </button>
      </div>
    </div>
  );
}
