import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ notify: (kind: ToastKind, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-md border bg-card px-3.5 py-3 text-sm shadow-lg',
              toast.kind === 'success' ? 'border-green-200 text-green-800' : 'border-red-200 text-red-800',
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="rounded p-0.5 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
