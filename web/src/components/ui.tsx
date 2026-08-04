import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import { avatarHue, initialsOf } from '../lib/avatar';

export function Button({
  variant = 'primary',
  loading = false,
  size = 'md',
  className,
  children,
  disabled,
  onDark = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  loading?: boolean;
  onDark?: boolean;
  size?: 'sm' | 'md';
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-dark disabled:bg-primary/50 shadow-sm',
    secondary: onDark
      ? 'bg-deep-2 text-slate-100 border border-deep-border hover:bg-white/10 disabled:opacity-50'
      : 'bg-white text-text border border-border hover:bg-slate-50 disabled:opacity-50',
    danger: 'bg-danger text-white hover:bg-red-700 disabled:bg-danger/50',
    success: 'bg-success text-white hover:bg-emerald-700 disabled:bg-success/50',
    ghost: onDark
      ? 'text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50'
      : 'text-muted hover:bg-slate-100 hover:text-text disabled:opacity-50',
  };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-8 px-2.5 py-1 text-xs' : 'min-h-10 px-3.5 py-2',
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
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  violet: 'bg-violet-50 text-violet-800 border-violet-200',
  teal: 'bg-teal-50 text-teal-800 border-teal-200',
  solidRed: 'bg-red-600 text-white border-red-600',
  solidAmber: 'bg-amber-500 text-white border-amber-500',
  solidGray: 'bg-slate-500 text-white border-slate-500',
};

const badgeTonesDark: Record<string, string> = {
  gray: 'bg-white/10 text-slate-300 border-white/15',
  blue: 'bg-sky-400/15 text-sky-300 border-sky-400/25',
  green: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  red: 'bg-red-400/15 text-red-300 border-red-400/25',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/25',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/25',
  teal: 'bg-teal-400/15 text-teal-300 border-teal-400/25',
  solidRed: 'bg-red-600 text-white border-red-500',
  solidAmber: 'bg-amber-500 text-white border-amber-400',
  solidGray: 'bg-slate-500 text-white border-slate-400',
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

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const hue = avatarHue(name);
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-[11px]';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        dim,
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 45% 42%)` }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  delta,
  onClick,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  delta?: { text: string; tone: 'up' | 'down' | 'flat' };
  onClick?: () => void;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const iconTone = {
    default: 'bg-teal-50 text-primary',
    danger: 'bg-red-50 text-danger',
    warning: 'bg-amber-50 text-warning',
    success: 'bg-emerald-50 text-success',
  }[tone];

  const DeltaIcon = delta?.tone === 'up' ? TrendingUp : delta?.tone === 'down' ? TrendingDown : Minus;
  const deltaClass =
    delta?.tone === 'up' ? 'text-emerald-700' : delta?.tone === 'down' ? 'text-red-600' : 'text-muted';

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-2xl font-bold tracking-tight tnum text-text">{value}</div>
          <div className="mt-1 text-xs font-medium text-muted">{label}</div>
        </div>
        <div className={cn('rounded-lg p-2', iconTone)}>{icon}</div>
      </div>
      {delta && (
        <div className={cn('mt-3 flex items-center gap-1 text-[11px] font-medium', deltaClass)}>
          <DeltaIcon size={12} />
          {delta.text}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md cursor-pointer"
      >
        {inner}
      </button>
    );
  }

  return <Card className="p-4 shadow-sm">{inner}</Card>;
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
      <AlertTriangle size={28} className="mb-1 opacity-40" />
      <span className="text-sm font-medium text-text">{title}</span>
      {description && <span className="max-w-sm text-xs">{description}</span>}
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
  'w-full min-h-10 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition';

const inputLight = 'border-border bg-white text-text placeholder:text-muted/70 focus:border-primary';
const inputDark = 'border-deep-border bg-deep-2 text-slate-100 placeholder:text-slate-500 focus:border-teal-400';

export function Input({ dark = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { dark?: boolean }) {
  return <input {...props} className={cn(inputClass, dark ? inputDark : inputLight, props.className)} />;
}

export function Select({ dark = false, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { dark?: boolean }) {
  return <select {...props} className={cn(inputClass, 'pr-8', dark ? inputDark : inputLight, props.className)} />;
}

export function Textarea({ dark = false, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { dark?: boolean }) {
  return <textarea {...props} className={cn(inputClass, 'min-h-20', dark ? inputDark : inputLight, props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-slate-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export function CodeTag({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] tnum text-slate-700">
      {children}
    </code>
  );
}
