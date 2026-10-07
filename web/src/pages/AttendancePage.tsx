import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Clock, Coffee, LogIn, LogOut, MapPin, StickyNote } from 'lucide-react';
import { ApiError } from '../api/client';
import { getAppSettings, listAttendance, listBranches, updateAppSettings } from '../api/endpoints';
import type { AttendanceAdmin, AttendanceSource, AttendanceType, Branch, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmployeePicker } from '../components/EmployeePicker';
import { PageHeader } from '../components/PageHeader';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Toggle } from '../components/ui';
import { useToast } from '../components/Toast';
import { DataTable, DEFAULT_PAGE_SIZE, PaginationBar } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { LocationMap } from '../components/LocationMap';
import { PhotoViewer } from '../components/PhotoViewer';
import { FLAG_LABELS, FLAG_TONES } from '../lib/flags';
import { formatDate, formatDateTime, formatMinutes, formatTime } from '../lib/format';

interface Filters {
  date_from: string;
  date_to: string;
  branch_id: string;
  department: string;
  employee_id: string;
  type: string;
  has_open_flags: string;
}

const EMPTY_FILTERS: Filters = {
  date_from: '',
  date_to: '',
  branch_id: '',
  department: '',
  employee_id: '',
  type: '',
  has_open_flags: '',
};

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    ...EMPTY_FILTERS,
    type: sp.get('type') ?? '',
    employee_id: sp.get('employee_id') ?? '',
  };
}

export function AttendancePage() {
  const { token, hasRole } = useAuth();
  const { notify } = useToast();
  const canToggleBreaks = hasRole('Super Admin', 'HR');
  const [searchParams] = useSearchParams();
  const initial = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const [filters, setFilters] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<AttendanceAdmin[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceAdmin | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [breaksEnabled, setBreaksEnabled] = useState<boolean | null>(null);
  const [breaksToggleBusy, setBreaksToggleBusy] = useState(false);

  useEffect(() => {
    if (!token || !canToggleBreaks) return;
    void getAppSettings(token)
      .then((s) => setBreaksEnabled(s.breaks_enabled))
      .catch(() => setBreaksEnabled(null));
  }, [token, canToggleBreaks]);

  async function toggleBreaksEnabled() {
    if (!token || breaksEnabled === null || breaksToggleBusy) return;
    const next = !breaksEnabled;
    setBreaksEnabled(next);
    setBreaksToggleBusy(true);
    try {
      const s = await updateAppSettings({ breaks_enabled: next }, token);
      setBreaksEnabled(s.breaks_enabled);
      notify('success', s.breaks_enabled ? 'On Break/Done Break enabled.' : 'On Break/Done Break disabled.');
    } catch (err) {
      setBreaksEnabled(!next);
      notify('error', err instanceof ApiError ? err.message : 'Failed to update break setting.');
    } finally {
      setBreaksToggleBusy(false);
    }
  }

  useEffect(() => {
    const next = filtersFromParams(searchParams);
    setFilters(next);
    setApplied(next);
    setPage(1);
  }, [searchParams]);

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
      const params: Record<string, string | number | boolean | undefined> = { page, per_page: perPage };
      if (applied.date_from) params.date_from = applied.date_from;
      if (applied.date_to) params.date_to = applied.date_to;
      if (applied.branch_id) params.branch_id = applied.branch_id;
      if (applied.department) params.department = applied.department;
      if (applied.employee_id) params.employee_id = applied.employee_id;
      if (applied.type) params.type = applied.type;
      if (applied.has_open_flags !== '') params.has_open_flags = applied.has_open_flags === '1';
      const result = await listAttendance(params, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [token, page, perPage, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(applied),
    [filters, applied],
  );

  const hasApplied = useMemo(() => JSON.stringify(applied) !== JSON.stringify(EMPTY_FILTERS), [applied]);

  function applyFilters() {
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      setFilterError('The from date cannot be after the to date.');
      return;
    }
    setFilterError(null);
    setPage(1);
    setApplied(filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setFilterError(null);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Review punches, selfies and verification results"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {canToggleBreaks && breaksEnabled !== null ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5">
                <Toggle
                  checked={breaksEnabled}
                  onChange={() => void toggleBreaksEnabled()}
                  disabled={breaksToggleBusy}
                  label="On Break/Done Break"
                />
                <span className="text-xs font-medium text-text">On Break/Done Break</span>
              </div>
            ) : null}
            <Button variant="secondary" onClick={clearFilters} disabled={!dirty && !hasApplied}>
              Clear filters
            </Button>
          </div>
        }
      />

      <Card className="mb-4 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From">
              <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            </Field>
            <Field label="To">
              <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
            </Field>
            <Field label="Employee">
              <EmployeePicker
                token={token}
                value={filters.employee_id}
                onChange={(employee_id) => setFilters({ ...filters, employee_id })}
                emptyLabel="All employees"
                placeholder="Search employees…"
              />
            </Field>
            <Field label="Type">
              <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="">All types</option>
                <option value="time_in">Time in</option>
                <option value="time_out">Time out</option>
                <option value="break_in">On Break</option>
                <option value="break_out">Done Break</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMoreOpen((o) => !o)}>
              More filters
              <ChevronDown size={14} className={moreOpen ? 'rotate-180' : ''} />
            </Button>
            <Button onClick={applyFilters} disabled={!dirty}>
              Apply
            </Button>
          </div>
        </div>
        {moreOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <Field label="Department">
              <Input value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} placeholder="e.g. Engineering" />
            </Field>
            <Field label="Open red flags">
              <Select value={filters.has_open_flags} onChange={(e) => setFilters({ ...filters, has_open_flags: e.target.value })}>
                <option value="">All</option>
                <option value="1">With open flags</option>
                <option value="0">Without flags</option>
              </Select>
            </Field>
          </div>
        )}
        {filterError && <p className="mt-3 text-xs font-medium text-danger">{filterError}</p>}
      </Card>

      <Card className="shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<AttendanceAdmin>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No attendance records found"
              emptyDescription="Adjust the filters or date range and try again."
              onRowClick={setSelected}
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => (
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.employee.name} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text">{r.employee.name}</div>
                        <div className="font-mono text-[11px] tnum text-muted">{r.employee.employee_id}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'time',
                  header: 'Time',
                  render: (r) => (
                    <div>
                      <div className="font-mono text-sm font-semibold tnum text-text">{formatTime(r.timestamp)}</div>
                      <div className="text-[11px] text-muted">{formatDate(r.timestamp)}</div>
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  render: (r) =>
                    r.type === 'time_in' ? (
                      <Badge tone="green">
                        <LogIn size={11} /> Time in
                      </Badge>
                    ) : r.type === 'time_out' ? (
                      <Badge tone="blue">
                        <LogOut size={11} /> Time out
                      </Badge>
                    ) : r.type === 'break_in' ? (
                      <Badge tone="amber">
                        <Coffee size={11} /> On Break
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <Coffee size={11} /> Done Break
                      </Badge>
                    ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (
                    <div className="flex flex-wrap gap-1">
                      {r.is_overbreak && <Badge tone="red">Overbreak</Badge>}
                      {r.photo && <Badge tone="teal">Selfie</Badge>}
                      {!r.is_overbreak && !r.photo && <span className="text-xs text-muted">—</span>}
                    </div>
                  ),
                },
                {
                  key: 'work',
                  header: 'Duration',
                  render: (r) => (
                    <span className="inline-flex items-center gap-1 font-mono text-xs tnum text-muted">
                      <Clock size={12} />
                      {r.type === 'break_out' && r.break_minutes != null
                        ? `${r.break_minutes}m`
                        : formatMinutes(r.work_minutes)}
                    </span>
                  ),
                },
                {
                  key: 'branch',
                  header: 'Branch',
                  render: (r) => <span className="text-sm text-text">{r.branch.name}</span>,
                },
                {
                  key: 'flags',
                  header: 'Flags',
                  render: (r) =>
                    r.fraud_flags.length === 0 ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.fraud_flags.map((f) => (
                          <Badge key={f.id} tone={FLAG_TONES[f.type]}>
                            {FLAG_LABELS[f.type]}
                          </Badge>
                        ))}
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

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Attendance record" wide>
        {selected && <AttendanceDetail record={selected} token={token ?? ''} />}
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

function AttendanceDetail({ record, token }: { record: AttendanceAdmin; token: string }) {
  const gps = record.gps_location;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-text">{record.employee.name}</div>
          <div className="font-mono text-xs tnum text-muted">
            {record.employee.employee_id} · {record.employee.department} · {record.employee.position}
          </div>
        </div>
        {record.type === 'time_in' ? (
          <Badge tone="green">Time in</Badge>
        ) : record.type === 'time_out' ? (
          <Badge tone="blue">Time out</Badge>
        ) : record.type === 'break_in' ? (
          <Badge tone="amber">On Break</Badge>
        ) : (
          <Badge tone="amber">Done Break</Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="bg-bg/50 px-3 py-1.5 text-xs font-medium text-muted">Selfie</div>
        {record.photo ? (
          <PhotoViewer
            url={`/api/admin/attendance/${record.id}/photo`}
            token={token}
            alt={`Selfie of ${record.employee.name}`}
            className="h-56 w-full"
          />
        ) : (
          <div className="flex h-40 items-center justify-center bg-bg text-xs text-muted">No selfie captured for this record</div>
        )}
      </div>

      <Card className="divide-y divide-border px-4 py-3">
            <DetailRow label="Timestamp"><span className="font-mono tnum">{formatDateTime(record.timestamp)}</span></DetailRow>
        <DetailRow label="Branch">
          {record.branch.name} ({record.branch.code})
        </DetailRow>
        <DetailRow label="Work minutes">{formatMinutes(record.work_minutes)}</DetailRow>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-xs font-semibold text-muted">
          <MapPin size={13} />
          GPS location
        </div>
        <div className="p-3">
          {gps ? (
            <LocationMap
              latitude={Number(gps.latitude)}
              longitude={Number(gps.longitude)}
              isWithinRadius={gps.is_within_radius}
              distanceMeters={gps.distance_from_branch_meters}
              className="h-64"
            />
          ) : (
            <div className="px-1 py-6 text-center text-xs text-muted">No GPS data captured for this record.</div>
          )}
        </div>
      </Card>

      {record.fraud_flags.length > 0 && (
        <Card className="px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-muted">Red flags</div>
          <div className="flex flex-wrap gap-1.5">
            {record.fraud_flags.map((f) => (
              <Badge key={f.id} tone={FLAG_TONES[f.type]}>
                {FLAG_LABELS[f.type]}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {record.notes && (
        <Card className="px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <StickyNote size={13} />
            Notes
          </div>
          <p className="text-sm text-text">{record.notes}</p>
        </Card>
      )}

      {!record.photo && !record.gps_location && record.fraud_flags.length === 0 && (
        <EmptyState title="No additional data" description="This record has no selfie, GPS data or red flags." />
      )}
    </div>
  );
}

export type { AttendanceSource, AttendanceType };
