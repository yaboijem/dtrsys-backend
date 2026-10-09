import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { closeOpenSession, listOpenSessions } from '../api/endpoints';
import type { OpenSession, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataTable, DEFAULT_PAGE_SIZE, PaginationBar } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorState, Field, Textarea } from '../components/ui';
import { formatDateTime } from '../lib/format';

const BREAK_LABELS: Record<string, string> = {
  '15_min': '15 mins break',
  '5_min': '5 mins break',
  lunch_60: '1hr Lunch Break',
  bio: 'Bio break',
  phone: 'Phone time',
  coaching: 'Coaching',
  huddle: 'Huddle',
  training: 'Training',
};

function breakLabel(kind: string | null): string {
  if (!kind) return 'Break';
  return BREAK_LABELS[kind] ?? kind;
}

export function OpenSessionsPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState<OpenSession[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<OpenSession> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ row: OpenSession; action: 'break_out' | 'time_out' } | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listOpenSessions({ page, per_page: perPage }, token);
      if (result.total > 0 && page > result.last_page) {
        setPage(result.last_page);
        return;
      }
      if (result.total === 0 && page !== 1) {
        setPage(1);
        return;
      }
      setRows(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load open sessions.');
    } finally {
      setLoading(false);
    }
  }, [token, page, perPage]);

  useEffect(() => {
    void load();
  }, [load]);

  function ask(row: OpenSession, action: 'break_out' | 'time_out') {
    setPending({ row, action });
    setNotes('');
  }

  async function confirm() {
    if (!token || !pending) return;
    setBusy(true);
    try {
      await closeOpenSession(
        pending.row.employee_id,
        { action: pending.action, notes: notes.trim() || undefined },
        token,
      );
      notify('success', pending.action === 'break_out' ? 'Break ended.' : 'Session closed.');
      setPending(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Could not update the session.');
    } finally {
      setBusy(false);
    }
  }

  const title = pending?.action === 'break_out' ? 'End break' : 'Time out';

  return (
    <div>
      <PageHeader
        title="Open Sessions"
        description="Employees still clocked in or on break. Close a forgotten break or time out so they can punch again."
      />

      <Card className="shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
          <DataTable<OpenSession>
            loading={loading && !rows}
            rows={rows ?? []}
            keyOf={(r) => r.employee_id}
            emptyTitle="No open sessions"
            emptyDescription="Everyone is clocked out."
            columns={[
              {
                key: 'employee',
                header: 'Employee',
                render: (r) => (
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text">{r.name}</div>
                    <div className="truncate text-xs text-muted">
                      {[r.employee_code, r.department, r.branch].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) =>
                  r.status === 'on_break' ? (
                    <Badge tone="amber">On break · {breakLabel(r.break_kind)}</Badge>
                  ) : (
                    <Badge tone="green">Time in</Badge>
                  ),
              },
              {
                key: 'since',
                header: 'Since',
                render: (r) => (
                  <span className="font-mono text-xs tnum text-muted">
                    {formatDateTime(r.status === 'on_break' ? r.break_started_at : r.time_in_at)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'center',
                className: 'w-0 whitespace-nowrap',
                render: (r) => (
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      disabled={r.status !== 'on_break'}
                      onClick={() => ask(r, 'break_out')}
                      className="pill-orange inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Done break
                    </button>
                    <button
                      type="button"
                      onClick={() => ask(r, 'time_out')}
                      className="pill-red inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold"
                    >
                      Time out
                    </button>
                  </div>
                ),
              },
            ]}
          />
          {paginated && (
            <PaginationBar
              page={page}
              paginated={paginated}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next);
                setPage(1);
              }}
            />
          )}
          </>
        )}
      </Card>

      <Modal open={pending !== null} onClose={() => (busy ? undefined : setPending(null))} title={title}>
        <p className="text-sm text-muted">
          {pending?.action === 'break_out'
            ? `${pending.row.name} will come off break and stay clocked in.`
            : `${pending?.row.name ?? 'This employee'} will be clocked out now. An open break is ended first.`}
        </p>
        <div className="mt-4">
        <Field label="Note">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Forgot to clock out"
            maxLength={500}
          />
        </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={pending?.action === 'time_out' ? 'danger' : 'primary'} onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Saving…' : title}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
