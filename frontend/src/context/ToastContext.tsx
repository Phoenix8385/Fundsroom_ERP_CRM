import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  /** Several toasts at once — one per stock shortage, for instance. */
  pushAll: (toasts: Array<Omit<Toast, 'id'>>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushAll = useCallback(
    (incoming: Array<Omit<Toast, 'id'>>) => {
      const created = incoming.map((toast) => ({ ...toast, id: nextId.current++ }));

      setToasts((current) => [...current, ...created]);

      for (const toast of created) {
        setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => pushAll([toast]),
    [pushAll],
  );

  return (
    <ToastContext.Provider value={useMemo(
      () => ({ toasts, push, pushAll, dismiss }),
      [toasts, push, pushAll, dismiss],
    )}
    >
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
            <div className="toast__text">
              <strong>{toast.title}</strong>
              {toast.body ? <span>{toast.body}</span> : null}
            </div>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);

  if (!value) throw new Error('useToast must be used inside <ToastProvider>');

  return value;
}
