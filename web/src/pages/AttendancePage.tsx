import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Clock, Coffee, LogIn, LogOut, MapPin, Monitor, StickyNote } from 'lucide-react';
import { ApiError } from '../api/client';
import { listAttendance, listBranches, listEmployees } from '../api/endpoints';
import type { AttendanceAdmin, AttendanceSource, AttendanceType, Branch, Employee, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
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
  is_late: string;
  is_early_timeout: string;
  source: string;
  has_open_flags: string;
}

const EMPTY_FILTERS: Filters = {
  date_from: '',
  date_to: '',
  branch_id: '',
  department: '',
  employee_id: '',
  type: '',
  is_late: '',
  is_early_timeout: '',
  source: '',
  has_open_flags: '',
};

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    ...EMPTY_FILTERS,
    is_late: sp.get('is_late') === '1' ? '1' : sp.get('is_late') === '0' ? '0' : '',
    is_early_timeout: sp.get('is_early_timeout') === '1' ? '1' : sp.get('is_early_timeout') === '0' ? '0' : '',
    type: sp.get('type') ?? '',
    employee_id: sp.get('employee_id') ?? '',
  };
}

export function AttendancePage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const initial = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const [filters, setFilters] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceAdmin[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceAdmin | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const loadEmployees = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listEmployees({ per_page: 100 }, token);
      setEmployees(result.data);
    } catch {
      setEmployees([]);
    }
  }, [token]);

  useEffect(() => {
    void loadBranches();
    void loadEmployees();
  }, [loadBranches, loadEmployees]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, per_page: 20 };
      if (applied.date_from) params.date_from = applied.date_from;
      if (applied.date_to) params.date_to = applied.date_to;
      if (applied.branch_id) params.branch_id = applied.branch_id;
      if (applied.department) params.department = applied.department;
      if (applied.employee_id) params.employee_id = applied.employee_id;
      if (applied.type) params.type = applied.type;
      if (applied.is_late !== '') params.is_late = applied.is_late === '1';
      if (applied.is_early_timeout !== '') params.is_early_timeout = applied.is_early_timeout === '1';
      if (applied.source) params.source = applied.source;
      if (applied.has_open_flags !== '') params.has_open_flags = applied.has_open_flags === '1';
      const result = await listAttendance(params, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [token, page, applied]);

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
          <Button variant="secondary" onClick={clearFilters} disabled={!dirty && !hasApplied}>
            Clear filters
          </Button>
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
              <Select value={filters.employee_id} onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}>
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="">All types</option>
                <option value="time_in">Time in</option>
                <option value="time_out">Time out</option>
                <option value="break_in">Break in</option>
                <option value="break_out">Break out</option>
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
            <Field label="Late">
              <Select value={filters.is_late} onChange={(e) => setFilters({ ...filters, is_late: e.target.value })}>
                <option value="">All</option>
                <option value="1">Late only</option>
                <option value="0">On time</option>
              </Select>
            </Field>
            <Field label="Early out">
              <Select value={filters.is_early_timeout} onChange={(e) => setFilters({ ...filters, is_early_timeout: e.target.value })}>
                <option value="">All</option>
                <option value="1">Early out only</option>
                <option value="0">Not early</option>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
                <option value="">All sources</option>
                <option value="online">Online</option>
                <option value="sync">Offline sync</option>
              </Select>
            </Field>
            <Field label="Open fraud flags">
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
                        <Coffee size={11} /> Break in
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <Coffee size={11} /> Break out
                      </Badge>
                    ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (
                    <div className="flex flex-wrap gap-1">
                      {r.is_late && <Badge tone="amber">Late</Badge>}
                      {r.type === 'time_out' && r.is_early_timeout && <Badge tone="amber">Early out</Badge>}
                      {r.is_overbreak && <Badge tone="red">Overbreak</Badge>}
                      {r.is_offline && <Badge tone="gray">Offline</Badge>}
                      {r.photo?.is_verified && <Badge tone="teal">Verified</Badge>}
                      {r.photo && !r.photo.is_verified && <Badge tone="red">Unverified</Badge>}
                      {!r.is_late &&
                        !(r.type === 'time_out' && r.is_early_timeout) &&
                        !r.is_overbreak &&
                        !r.is_offline &&
                        !r.photo && <span className="text-xs text-muted">—</span>}
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
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
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
          <Badge tone="amber">Break in</Badge>
        ) : (
          <Badge tone="amber">Break out</Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          <div>
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
          <div>
            <div className="bg-bg/50 px-3 py-1.5 text-xs font-medium text-muted">Reference photo</div>
            <PhotoViewer
              url={`/api/admin/employees/${record.employee.id}/reference-photo`}
              token={token}
              alt={`Reference photo of ${record.employee.name}`}
              className="h-56 w-full"
              fallbackText="No reference photo on file"
            />
          </div>
        </div>
        {record.photo && (
          <div className="flex items-center gap-2 border-t border-border bg-bg/50 px-3 py-2">
            <Badge tone={record.photo.is_verified ? 'green' : 'red'}>{record.photo.is_verified ? 'Verified' : 'Not verified'}</Badge>
            {record.photo.liveness_status && <Badge tone="gray">{record.photo.liveness_status}</Badge>}
          </div>
        )}
      </div>

      <Card className="divide-y divide-border px-4 py-3">
            <DetailRow label="Timestamp"><span className="font-mono tnum">{formatDateTime(record.timestamp)}</span></DetailRow>
        <DetailRow label="Branch">
          {record.branch.name} ({record.branch.code})
        </DetailRow>
        <DetailRow label="Device">
          {record.device ? (
            <span className="inline-flex items-center gap-1">
              <Monitor size={13} />
              {record.device.name ? `${record.device.name} (${record.device.device_id})` : record.device.device_id}
            </span>
          ) : (
            '—'
          )}
        </DetailRow>
        <DetailRow label="Work minutes">{formatMinutes(record.work_minutes)}</DetailRow>
        <DetailRow label="Early timeout">
          {record.type === 'time_out' ? (
            record.is_early_timeout ? <Badge tone="amber">Early out</Badge> : <Badge tone="gray">On time</Badge>
          ) : (
            '—'
          )}
        </DetailRow>
        <DetailRow label="Source">
          <span className="inline-flex items-center gap-1.5">
            {record.is_offline ? <Badge tone="amber">Offline</Badge> : <Badge tone="gray">{record.source}</Badge>}
          </span>
        </DetailRow>
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
          <div className="mb-2 text-xs font-semibold text-muted">Fraud flags</div>
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
        <EmptyState title="No additional data" description="This record has no selfie, GPS data or fraud flags." />
      )}
    </div>
  );
}

export type { AttendanceSource, AttendanceType };
