import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  onDark = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  onDark?: boolean;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-dark disabled:bg-primary/50',
    secondary: onDark
      ? 'bg-deep-2 text-slate-100 border border-deep-border hover:bg-white/10 disabled:opacity-50'
      : 'bg-white text-text border border-border hover:bg-bg disabled:opacity-50',
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
  return <div className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>;
}

const badgeTones: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

const badgeTonesDark: Record<string, string> = {
  gray: 'bg-white/10 text-slate-300 border-white/15',
  blue: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/25',
  green: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  red: 'bg-red-400/15 text-red-300 border-red-400/25',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/25',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/25',
};

export function Badge({
  tone = 'gray',
  onDark = false,
  children,
  className,
}: {
  tone?: keyof typeof badgeTones;
  onDark?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        onDark ? badgeTonesDark[tone] : badgeTones[tone],
        className,
      )}
    >
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

export function Field({
  label,
  error,
  required,
  dark = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={cn('mb-1 block text-xs font-medium', dark ? 'text-slate-400' : 'text-muted')}>
        {label}
        {required && <span className={dark ? 'text-red-400' : 'text-danger'}> *</span>}
      </span>
      {children}
      {error && <span className={cn('mt-1 block text-xs', dark ? 'text-red-400' : 'text-danger')}>{error}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition';

const inputLight =
  'border-border bg-white text-text placeholder:text-muted/70 focus:border-primary';

const inputDark =
  'border-deep-border bg-deep-2 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400';

export function Input({ dark = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { dark?: boolean }) {
  return <input {...props} className={cn(inputClass, dark ? inputDark : inputLight, props.className)} />;
}

export function Select({ dark = false, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { dark?: boolean }) {
  return <select {...props} className={cn(inputClass, 'pr-8', dark ? inputDark : inputLight, props.className)} />;
}

export function Textarea({ dark = false, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { dark?: boolean }) {
  return <textarea {...props} className={cn(inputClass, 'min-h-20', dark ? inputDark : inputLight, props.className)} />;
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
