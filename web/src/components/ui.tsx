import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-dark disabled:bg-primary/50',
    secondary: 'bg-white text-text border border-border hover:bg-bg disabled:opacity-50',
    danger: 'bg-danger text-white hover:bg-red-700 disabled:bg-danger/50',
    ghost: 'text-muted hover:bg-bg hover:text-text disabled:opacity-50',
  };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-border bg-card shadow-sm', className)}>{children}</div>;
}

const badgeTones: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Loader2 size={28} className="animate-spin text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center text-muted">
      <AlertTriangle size={28} className="mb-1 opacity-50" />
      <span className="text-sm font-medium text-text">{title}</span>
      {description && <span className="text-xs max-w-sm">{description}</span>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle size={28} className="text-danger" />
      <span className="text-sm font-medium text-text">{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-muted/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, 'pr-8', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-20', props.className)} />;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-success' : 'bg-slate-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
