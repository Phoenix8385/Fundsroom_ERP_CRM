import type { ReactNode } from 'react';

/** Shimmering placeholder rows, sized to the table they stand in for. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="skeleton-row" key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <span
              className="skeleton-cell"
              key={columnIndex}
              // Uneven widths read as text rather than as a block of grey.
              style={{ width: `${[38, 22, 16, 14, 10, 18][columnIndex % 6]}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Stacked placeholder lines for a detail pane or drawer. */
export function DetailSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="skeleton-detail" aria-hidden="true">
      <span className="skeleton-cell skeleton-cell--title" />
      {Array.from({ length: lines }, (_, index) => (
        <span
          className="skeleton-cell"
          key={index}
          style={{ width: `${[90, 70, 80, 55, 65, 75][index % 6]}%` }}
        />
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

/** Announces that a fetch is running, for screen readers as well as eyes. */
export function LoadingRegion({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p className="error-state__title">Could not load this</p>
      <p className="error-state__message">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
