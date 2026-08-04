import { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';

import type { Employee } from '../api/types';
import { cn } from '../lib/cn';

function employeeLabel(e: Employee): string {
  const id = e.employee_id ? ` (${e.employee_id})` : '';
  return `${e.full_name}${id}`;
}

function matchesQuery(e: Employee, q: string): boolean {
  if (!q) return true;
  const hay = `${e.full_name} ${e.employee_id ?? ''} ${e.department ?? ''} ${e.position ?? ''}`.toLowerCase();
  return hay.includes(q);
}

type BaseProps = {
  employees: Employee[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

export type EmployeePickerProps = SingleProps | MultiProps;

export function EmployeePicker(props: EmployeePickerProps) {
  const { employees, placeholder = 'Search employees…', disabled, className } = props;
  const multiple = props.multiple === true;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => matchesQuery(e, q));
  }, [employees, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selectedSingle = !multiple
    ? employees.find((e) => String(e.id) === props.value)
    : undefined;

  const selectedMulti = multiple
    ? employees.filter((e) => props.value.includes(String(e.id)))
    : [];

  const triggerLabel = multiple
    ? selectedMulti.length === 0
      ? placeholder
      : selectedMulti.length === 1
        ? employeeLabel(selectedMulti[0])
        : `${selectedMulti.length} employees selected`
    : selectedSingle
      ? employeeLabel(selectedSingle)
      : (props as SingleProps).emptyLabel ?? placeholder;

  const isEmpty = multiple ? selectedMulti.length === 0 : !props.value;

  function pickSingle(id: string) {
    if (!multiple) {
      props.onChange(id);
      setOpen(false);
    }
  }

  function toggleMulti(id: string) {
    if (!multiple) return;
    const set = new Set(props.value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    props.onChange(Array.from(set));
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
          aria-label="Select employee"
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <span className="flex shrink-0 items-center gap-1 text-muted">
            {!multiple && props.value ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear employee"
                className="rounded p-0.5 hover:bg-slate-100 hover:text-text"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onChange('');
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
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted/70"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1" role="listbox">
            {!multiple && (props as SingleProps).allowEmpty !== false ? (
              <button
                type="button"
                role="option"
                aria-selected={!props.value}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer hover:bg-slate-50',
                  !props.value ? 'bg-teal-50 text-primary' : 'text-muted',
                )}
                onClick={() => pickSingle('')}
              >
                <span className="w-4 shrink-0">{!props.value ? <Check size={14} /> : null}</span>
                {(props as SingleProps).emptyLabel ?? 'All employees'}
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-xs text-muted">No employees match.</div>
            ) : (
              filtered.map((e) => {
                const id = String(e.id);
                const selected = multiple ? props.value.includes(id) : props.value === id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer hover:bg-slate-50',
                      selected ? 'bg-teal-50 text-primary' : 'text-text',
                    )}
                    onClick={() => (multiple ? toggleMulti(id) : pickSingle(id))}
                  >
                    <span className="w-4 shrink-0">{selected ? <Check size={14} /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.full_name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {[e.employee_id, e.department].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {multiple && selectedMulti.length > 0 ? (
            <div className="flex items-center justify-between border-t border-border px-2.5 py-2">
              <span className="text-[11px] text-muted">{selectedMulti.length} selected</span>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary cursor-pointer hover:underline"
                onClick={() => props.onChange([])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
