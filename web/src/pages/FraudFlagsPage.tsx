import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListFilter } from 'lucide-react';
import { ApiError } from '../api/client';
import { listBranches, listFraudFlags, reviewFraudFlag } from '../api/endpoints';
import type { Branch, FraudFlag, FraudFlagStatus, FraudFlagType, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState, Field, Select, Textarea } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { PhotoViewer } from '../components/PhotoViewer';
import { useToast } from '../components/Toast';
import { FLAG_LABELS, FLAG_TONES, SEVERITY_TONES, STATUS_TONES } from '../lib/flags';
import { formatDateTime, formatMeters } from '../lib/format';

interface Filters {
  status: string;
  type: string;
  severity: string;
  branch_id: string;
}

const EMPTY_FILTERS: Filters = { status: 'open', type: '', severity: '', branch_id: '' };

const FLAG_TYPES = Object.keys(FLAG_LABELS) as FraudFlagType[];

export function FraudFlagsPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FraudFlag[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FraudFlag | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listBranches({ per_page: 100 }, token);
      setBranches(result.data);
    } catch {
      setBranches([]);
    }
  }, [token]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, per_page: 20 };
      if (applied.status) params.status = applied.status;
      if (applied.type) params.type = applied.type;
      if (applied.severity) params.severity = applied.severity;
      if (applied.branch_id) params.branch_id = applied.branch_id;
      const result = await listFraudFlags(params, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load fraud flags.');
    } finally {
      setLoading(false);
    }
  }, [token, page, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(filters) !== JSON.stringify(applied), [filters, applied]);

  function applyFilters() {
    setPage(1);
    setApplied(filters);
  }

  function refreshFlag(updated: FraudFlag) {
    setData((prev) => (prev ? prev.map((f) => (f.id === updated.id ? updated : f)) : prev));
    setSelected(updated);
  }

  async function handleReview(flag: FraudFlag, status: Exclude<FraudFlagStatus, 'open'>, notes: string) {
    if (!token) return;
    setUpdating(true);
    try {
      const updated = await reviewFraudFlag(flag.id, status, notes || undefined, token);
      refreshFlag(updated);
      notify('success', status === 'reviewed' ? 'Flag marked as reviewed.' : 'Flag dismissed.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to update the flag.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Fraud flags</h1>
          <p className="text-xs text-muted">Review suspicious attendance records</p>
        </div>
        <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!dirty}>
          Reset filters
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
          <ListFilter size={14} />
          Filters
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Status">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">All types</option>
              {FLAG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FLAG_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
              <option value="">All severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Branch">
            <Select value={filters.branch_id} onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={applyFilters} disabled={!dirty} className="w-full">
              Apply
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<FraudFlag>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No fraud flags found"
              emptyDescription="Adjust the filters and try again."
              onRowClick={setSelected}
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => (
                    <div>
                      <div className="font-medium text-text">{r.attendance.employee?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{r.attendance.employee?.employee_id ?? ''}</div>
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  render: (r) => <Badge tone={FLAG_TONES[r.type]}>{FLAG_LABELS[r.type]}</Badge>,
                },
                { key: 'severity', header: 'Severity', render: (r) => <Badge tone={SEVERITY_TONES[r.severity]}>{r.severity}</Badge> },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONES[r.status]}>{r.status}</Badge> },
                {
                  key: 'timestamp',
                  header: 'Punch time',
                  render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.attendance.timestamp)}</span>,
                },
                {
                  key: 'branch',
                  header: 'Branch',
                  render: (r) => <span className="text-xs text-text">{r.attendance.branch ?? '—'}</span>,
                },
                {
                  key: 'created',
                  header: 'Flagged at',
                  render: (r) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.created_at)}</span>,
                },
              ]}
            />
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Fraud flag review" wide>
        {selected && (
          <FlagReview
            flag={selected}
            token={token ?? ''}
            updating={updating}
            onReview={(status, notes) => handleReview(selected, status, notes)}
          />
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-right text-sm text-text">{children}</span>
    </div>
  );
}

function FlagReview({
  flag,
  token,
  updating,
  onReview,
}: {
  flag: FraudFlag;
  token: string;
  updating: boolean;
  onReview: (status: Exclude<FraudFlagStatus, 'open'>, notes: string) => void;
}) {
  const [notes, setNotes] = useState(flag.notes ?? '');
  const attendance = flag.attendance;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-text">{attendance.employee?.name ?? 'Unknown employee'}</div>
          <div className="text-xs text-muted">
            {attendance.employee?.employee_id} · {attendance.employee?.department}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={FLAG_TONES[flag.type]}>{FLAG_LABELS[flag.type]}</Badge>
          <Badge tone={SEVERITY_TONES[flag.severity]}>{flag.severity}</Badge>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {attendance.photo?.path ? (
          <PhotoViewer url={`/api/admin/attendance/${attendance.id}/photo`} token={token} alt="Selfie" className="h-64 w-full" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-bg text-xs text-muted">No selfie captured</div>
        )}
      </div>

      {flag.details && Object.keys(flag.details).length > 0 && (
        <Card className="px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-muted">Flag details</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-bg p-3 font-mono text-xs text-text">{JSON.stringify(flag.details, null, 2)}</pre>
        </Card>
      )}

      <Card className="divide-y divide-border px-4">
        <DetailRow label="Punch time">{formatDateTime(attendance.timestamp)}</DetailRow>
        <DetailRow label="Type">{attendance.type === 'time_in' ? 'Time in' : 'Time out'}</DetailRow>
        <DetailRow label="Branch">{attendance.branch ?? '—'}</DetailRow>
        <DetailRow label="Source">{attendance.is_offline ? 'Offline sync' : attendance.source}</DetailRow>
        <DetailRow label="Distance from branch">
          {attendance.gps_location?.distance_from_branch_meters !== null && attendance.gps_location?.distance_from_branch_meters !== undefined
            ? formatMeters(attendance.gps_location.distance_from_branch_meters)
            : '—'}
        </DetailRow>
        <DetailRow label="Within radius">
          {attendance.gps_location?.is_within_radius === null || attendance.gps_location?.is_within_radius === undefined ? (
            '—'
          ) : attendance.gps_location.is_within_radius ? (
            <Badge tone="green">Yes</Badge>
          ) : (
            <Badge tone="red">No</Badge>
          )}
        </DetailRow>
      </Card>

      {flag.status !== 'open' && (
        <Card className="px-4 py-3">
          <DetailRow label="Status">
            <Badge tone={STATUS_TONES[flag.status]}>{flag.status}</Badge>
          </DetailRow>
          <DetailRow label="Reviewed by">{flag.reviewer?.name ?? '—'}</DetailRow>
          {flag.reviewed_at && <DetailRow label="Reviewed at">{formatDateTime(flag.reviewed_at)}</DetailRow>}
          {flag.notes && <DetailRow label="Notes">{flag.notes}</DetailRow>}
        </Card>
      )}

      {flag.status === 'open' && (
        <Card className="px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-muted">Review</div>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note about this review…" />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" loading={updating} onClick={() => onReview('dismissed', notes)}>
              Dismiss
            </Button>
            <Button loading={updating} onClick={() => onReview('reviewed', notes)}>
              Confirm flag
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
