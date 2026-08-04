import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Paginated } from '../api/types';
import { cn } from '../lib/cn';

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading,
  emptyTitle,
  emptyDescription,
  onRowClick,
}: {
  columns: { key: string; header: ReactNode; className?: string; render: (row: T) => ReactNode }[];
  rows: T[];
  keyOf: (row: T) => string | number;
  loading?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              {columns.map((col) => (
                <div key={col.key} className={cn('h-4 flex-1 animate-pulse rounded bg-slate-200/80', col.className)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-16 text-center">
        <span className="text-sm font-medium text-text">{emptyTitle}</span>
        {emptyDescription && <span className="text-xs text-muted">{emptyDescription}</span>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-2.5 font-semibold', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={keyOf(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              className={cn(
                'transition-colors',
                onRowClick &&
                  'cursor-pointer hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaginationBar({
  page,
  paginated,
  onPageChange,
}: {
  page: number;
  paginated: Paginated<unknown>;
  onPageChange: (page: number) => void;
}) {
  if (paginated.total === 0) return null;
  const from = paginated.from ?? 0;
  const to = paginated.to ?? 0;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
      <span className="font-mono tnum">
        Showing {from}–{to} of {paginated.total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!paginated.prev_page_url}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-border bg-white p-1.5 text-text hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-mono tnum px-2">
          Page {paginated.current_page} of {paginated.last_page}
        </span>
        <button
          type="button"
          disabled={!paginated.next_page_url}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-border bg-white p-1.5 text-text hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
