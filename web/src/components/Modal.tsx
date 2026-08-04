import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useDialog } from '../lib/useDialog';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-deep/60 p-0 sm:items-start sm:p-8"
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
          'w-full border border-border bg-card outline-none rounded-t-xl sm:rounded-xl',
          wide ? 'max-w-2xl' : 'max-w-lg',
          'max-h-[min(92dvh,100%)] overflow-y-auto',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-text">{message}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-md border border-border bg-white px-3.5 py-2 text-sm font-medium text-text hover:bg-bg cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={
            danger
              ? 'rounded-md bg-danger px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 cursor-pointer disabled:opacity-50'
              : 'rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-dark cursor-pointer disabled:opacity-50'
          }
        >
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
