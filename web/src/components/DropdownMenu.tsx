import type { ReactNode } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';

export function DropdownMenu({
  trigger,
  children,
  align = 'end',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[10.5rem] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-slate-100',
        danger ? 'text-danger' : 'text-text',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </Dropdown.Item>
  );
}
