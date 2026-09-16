import { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';

export type SearchableSelectOption = { value: string; label: string };

export type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  searchPlaceholder?: string;
  noneMatchLabel?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled,
  className,
  emptyLabel = 'None',
  allowEmpty = true,
  searchPlaceholder = 'Search…',
  noneMatchLabel = 'No matches.',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected ? selected.label : allowEmpty && !value ? emptyLabel : placeholder;
  const isEmpty = !value;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
            isEmpty ? 'text-muted' : 'text-text',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <span className="flex shrink-0 items-center gap-1 text-muted">
            {value ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="rounded p-0.5 hover:bg-slate-100 hover:text-text"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (allowEmpty) onChange('');
                }}
              >
                <X size={14} />
              </span>
            ) : null}
            <ChevronsUpDown size={14} />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[16rem] overflow-hidden rounded-lg border border-border bg-white shadow-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted/70"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1" role="listbox">
            {allowEmpty ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer hover:bg-slate-50',
                  !value ? 'bg-teal-50 text-primary' : 'text-muted',
                )}
                onClick={() => pick('')}
              >
                <span className="w-4 shrink-0">{!value ? <Check size={14} /> : null}</span>
                {emptyLabel}
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-xs text-muted">{noneMatchLabel}</div>
            ) : (
              filtered.map((o) => {
                const selectedOpt = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={selectedOpt}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer hover:bg-slate-50',
                      selectedOpt ? 'bg-teal-50 text-primary' : 'text-text',
                    )}
                    onClick={() => pick(o.value)}
                  >
                    <span className="w-4 shrink-0">{selectedOpt ? <Check size={14} /> : null}</span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
