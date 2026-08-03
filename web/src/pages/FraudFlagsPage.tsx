import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '../lib/cn';
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
  const [pendingAction, setPendingAction] = useState<Exclude<FraudFlagStatus, 'open'> | null>(null);

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

  const hasApplied = useMemo(() => JSON.stringify(applied) !== JSON.stringify(EMPTY_FILTERS), [applied]);

  function applyFilters() {
    setPage(1);
    setApplied(filters);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function refreshFlag(updated: FraudFlag) {
    setData((prev) => (prev ? prev.map((f) => (f.id === updated.id ? updated : f)) : prev));
    setSelected(updated);
  }

  async function handleReview(flag: FraudFlag, status: Exclude<FraudFlagStatus, 'open'>, notes: string) {
    if (!token) return;
    setPendingAction(status);
    try {
      const updated = await reviewFraudFlag(flag.id, status, notes || undefined, token);
      refreshFlag(updated);
      notify('success', status === 'reviewed' ? 'Flag marked as reviewed.' : 'Flag dismissed.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to update the flag.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Fraud flags</h1>
          <p className="text-xs text-muted">Review suspicious attendance records</p>
        </div>
        <Button variant="secondary" onClick={resetFilters} disabled={!dirty && !hasApplied}>
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
                { key: 'severity', header: 'Severity', render: (r) => <Badge tone={SEVERITY_TONES[r.severity]} className="capitalize">{r.severity}</Badge> },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONES[r.status]} className="capitalize">{r.status}</Badge> },
                {
                  key: 'timestamp',
                  header: 'Punch time',
                  render: (r) => <span className="font-mono tnum whitespace-nowrap">{formatDateTime(r.attendance.timestamp)}</span>,
                },
                {
                  key: 'branch',
                  header: 'Branch',
                  render: (r) => <span className="text-xs text-text">{r.attendance.branch ?? '—'}</span>,
                },
                {
                  key: 'created',
                  header: 'Flagged at',
                  render: (r) => <span className="font-mono tnum whitespace-nowrap text-xs text-muted">{formatDateTime(r.created_at)}</span>,
                },
              ]}
            />
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Fraud flag review" wide dark>
        {selected && (
          <FlagReview
            flag={selected}
            token={token ?? ''}
            pendingAction={pendingAction}
            onReview={(status, notes) => handleReview(selected, status, notes)}
          />
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, children, dark = false }: { label: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className={cn('text-xs font-medium', dark ? 'text-slate-400' : 'text-muted')}>{label}</span>
      <span className={cn('text-right text-sm', dark ? 'text-slate-100' : 'text-text')}>{children}</span>
    </div>
  );
}

const DETAIL_LABELS: Record<string, string> = {
  distance_meters: 'Distance from branch',
  accuracy_meters: 'GPS accuracy',
  confidence: 'Match confidence',
  liveness_passed: 'Liveness check',
  duration_minutes: 'Time between punches',
  estimated_speed_kmh: 'Estimated speed',
  previous_punch_at: 'Previous punch',
  identical_coordinates: 'Identical coordinates',
  elapsed_minutes: 'Elapsed since previous punch',
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'previous_punch_at' && typeof value === 'string') return formatDateTime(value);
  if (typeof value === 'number' && (key === 'distance_meters' || key === 'accuracy_meters')) return formatMeters(value);
  if (typeof value === 'number' && key === 'estimated_speed_kmh') return `${value.toFixed(1)} km/h`;
  if (typeof value === 'number' && (key === 'duration_minutes' || key === 'elapsed_minutes')) return `${Math.round(value)} min`;
  if (typeof value === 'number' && key === 'confidence') return `${(value * 100).toFixed(0)}%`;
  if (typeof value === 'string' && value) return value;
  return String(value);
}

function FlagDetails({ details, dark = false }: { details: Record<string, unknown>; dark?: boolean }) {
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="divide-y divide-deep-border">
      {entries.map(([key, value]) => (
        <DetailRow key={key} label={DETAIL_LABELS[key] ?? humanizeKey(key)} dark={dark}>
          {formatDetailValue(key, value)}
        </DetailRow>
      ))}
    </div>
  );
}

function FlagReview({
  flag,
  token,
  pendingAction,
  onReview,
}: {
  flag: FraudFlag;
  token: string;
  pendingAction: Exclude<FraudFlagStatus, 'open'> | null;
  onReview: (status: Exclude<FraudFlagStatus, 'open'>, notes: string) => void;
}) {
  const [notes, setNotes] = useState(flag.notes ?? '');
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (flag.status !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (e.key === 'c' || e.key === 'C') onReview('reviewed', notesRef.current);
      else if (e.key === 'd' || e.key === 'D') onReview('dismissed', notesRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flag.status, onReview]);

  const attendance = flag.attendance;
  const busy = pendingAction !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-100">{attendance.employee?.name ?? 'Unknown employee'}</div>
          <div className="font-mono text-xs tnum text-slate-400">
            {attendance.employee?.employee_id} · {attendance.employee?.department}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={FLAG_TONES[flag.type]} onDark>{FLAG_LABELS[flag.type]}</Badge>
          <Badge tone={SEVERITY_TONES[flag.severity]} className="capitalize" onDark>{flag.severity}</Badge>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-deep-border">
        <div className="grid grid-cols-1 divide-y divide-deep-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          <div>
            <div className="bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400">Selfie</div>
            {attendance.photo?.path ? (
              <PhotoViewer
                url={`/api/admin/attendance/${attendance.id}/photo`}
                token={token}
                alt={`Selfie of ${attendance.employee?.name ?? 'employee'}`}
                className="h-56 w-full"
                dark
              />
            ) : (
              <div className="flex h-40 items-center justify-center bg-deep-2 text-xs text-slate-400">No selfie captured</div>
            )}
          </div>
          <div>
            <div className="bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400">Reference photo</div>
            {attendance.employee?.id ? (
              <PhotoViewer
                url={`/api/admin/employees/${attendance.employee.id}/reference-photo`}
                token={token}
                alt={`Reference photo of ${attendance.employee.name}`}
                className="h-56 w-full"
                fallbackText="No reference photo on file"
                dark
              />
            ) : (
              <div className="flex h-40 items-center justify-center bg-deep-2 text-xs text-slate-400">No reference photo on file</div>
            )}
          </div>
        </div>
        {typeof attendance.photo?.is_verified === 'boolean' && (
          <div className="flex items-center gap-2 border-t border-deep-border bg-white/5 px-3 py-2">
            <Badge tone={attendance.photo.is_verified ? 'green' : 'red'} onDark>{attendance.photo.is_verified ? 'Verified' : 'Not verified'}</Badge>
            {attendance.photo.liveness_status && <Badge tone="gray" onDark>{attendance.photo.liveness_status}</Badge>}
          </div>
        )}
      </div>

      {flag.details && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <div className="mb-1 text-xs font-semibold text-slate-400">Why this was flagged</div>
          <FlagDetails details={flag.details} dark />
        </div>
      )}

      <div className="divide-y divide-deep-border rounded-lg border border-deep-border bg-deep-2 px-4">
        <DetailRow label="Punch time" dark><span className="font-mono tnum">{formatDateTime(attendance.timestamp)}</span></DetailRow>
        <DetailRow label="Type" dark>{attendance.type === 'time_in' ? 'Time in' : 'Time out'}</DetailRow>
        <DetailRow label="Branch" dark>{attendance.branch ?? '—'}</DetailRow>
        <DetailRow label="Source" dark>{attendance.is_offline ? 'Offline sync' : attendance.source}</DetailRow>
        <DetailRow label="Distance from branch" dark>
          {attendance.gps_location?.distance_from_branch_meters !== null && attendance.gps_location?.distance_from_branch_meters !== undefined
            ? formatMeters(attendance.gps_location.distance_from_branch_meters)
            : '—'}
        </DetailRow>
        <DetailRow label="Within radius" dark>
          {attendance.gps_location?.is_within_radius === null || attendance.gps_location?.is_within_radius === undefined ? (
            '—'
          ) : attendance.gps_location.is_within_radius ? (
            <Badge tone="green" onDark>Yes</Badge>
          ) : (
            <Badge tone="red" onDark>No</Badge>
          )}
        </DetailRow>
      </div>

      {flag.status !== 'open' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <DetailRow label="Status" dark>
            <Badge tone={STATUS_TONES[flag.status]} className="capitalize" onDark>{flag.status}</Badge>
          </DetailRow>
          <DetailRow label="Reviewed by" dark>{flag.reviewer?.name ?? '—'}</DetailRow>
          {flag.reviewed_at && <DetailRow label="Reviewed at" dark><span className="font-mono tnum">{formatDateTime(flag.reviewed_at)}</span></DetailRow>}
          {flag.notes && <DetailRow label="Notes" dark>{flag.notes}</DetailRow>}
        </div>
      )}

      {flag.status === 'open' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-slate-400">Review</div>
          <Field label="Notes (optional)" dark>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note about this review…" dark />
          </Field>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <kbd className="rounded border border-deep-border bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">C</kbd>
              Confirm
              <kbd className="ml-1 rounded border border-deep-border bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">D</kbd>
              Dismiss
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onDark loading={pendingAction === 'dismissed'} disabled={busy} onClick={() => onReview('dismissed', notes)}>
                Dismiss flag
              </Button>
              <Button loading={pendingAction === 'reviewed'} disabled={busy} onClick={() => onReview('reviewed', notes)}>
                Confirm as fraud
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Confirming keeps the flag on the attendance record for HR follow-up. Dismissing closes it without further action. Both decisions are written to the
            audit trail.
          </p>
        </div>
      )}
    </div>
  );
}
