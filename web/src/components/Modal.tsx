import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('w-full rounded-lg bg-card shadow-xl', wide ? 'max-w-2xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
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
      <div className="mt-5 flex justify-end gap-2">
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
