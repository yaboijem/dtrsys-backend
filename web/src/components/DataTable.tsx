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
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            {columns.map((col) => (
              <div key={col.key} className={cn('h-4 flex-1 animate-pulse rounded bg-slate-100', col.className)} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-14 text-center">
        <span className="text-sm font-medium text-text">{emptyTitle}</span>
        {emptyDescription && <span className="text-xs text-muted">{emptyDescription}</span>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-xs uppercase tracking-wide text-muted">
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
              onClick={() => onRowClick?.(row)}
              className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-blue-50/50')}
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
      <span>
        Showing {from}–{to} of {paginated.total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!paginated.prev_page_url}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-border bg-white p-1.5 text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-2">
          Page {paginated.current_page} of {paginated.last_page}
        </span>
        <button
          type="button"
          disabled={!paginated.next_page_url}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-border bg-white p-1.5 text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
