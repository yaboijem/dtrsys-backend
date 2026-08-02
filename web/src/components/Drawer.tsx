import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-card shadow-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
