import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useDialog } from '../lib/useDialog';

export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
  dark = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  dark?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-deep/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col outline-none',
          dark ? 'border-l border-deep-border bg-deep text-slate-100' : 'border-l border-border bg-card',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={cn('flex items-center justify-between border-b px-5 py-3.5', dark ? 'border-deep-border' : 'border-border')}>
          <h2 id={titleId} className={cn('text-sm font-semibold', dark ? 'text-slate-100' : 'text-text')}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className={cn(
              'rounded p-1 cursor-pointer',
              dark ? 'text-slate-400 hover:bg-white/10 hover:text-slate-100' : 'text-muted hover:bg-bg hover:text-text',
            )}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
