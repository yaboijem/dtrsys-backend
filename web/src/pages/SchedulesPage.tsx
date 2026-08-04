import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, ListFilter, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { createSchedule, deleteSchedule, listBranches, listEmployees, listSchedules, listShifts } from '../api/endpoints';
import type { Branch, Employee, Paginated, ScheduleAdmin, Shift } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, ErrorState, Field, Input, Select } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { addDays, formatDate, formatClockTime, startOfWeek, toLocalDateInput } from '../lib/format';
import { cn } from '../lib/cn';

interface FilterState {
  date: string;
  employee_id: string;
  shift_id: string;
  branch_id: string;
}

const EMPTY_FILTER: FilterState = { date: '', employee_id: '', shift_id: '', branch_id: '' };

const SHIFT_CHIP = ['teal', 'blue', 'violet', 'amber', 'green'] as const;

function shiftTone(name: string): (typeof SHIFT_CHIP)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return SHIFT_CHIP[h % SHIFT_CHIP.length];
}

export function SchedulesPage() {
  const { token, user } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);
  const [data, setData] = useState<ScheduleAdmin[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toLocalDateInput()));

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', shift_id: '', date: '' });
  const [bulkForm, setBulkForm] = useState({ employee_ids: [] as string[], shift_id: '', date: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ScheduleAdmin | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isBranchManager = user?.roles?.includes('Branch Manager') ?? false;

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {};
      if (view === 'week') {
        params.date_from = weekStart;
        params.date_to = addDays(weekStart, 6);
        params.per_page = 100;
        params.page = 1;
      } else {
        if (filters.date) params.date = filters.date;
        params.page = page;
        params.per_page = 20;
      }
      if (filters.employee_id) params.employee_id = filters.employee_id;
      if (filters.shift_id) params.shift_id = filters.shift_id;
      if (filters.branch_id) params.branch_id = filters.branch_id;
      const result = await listSchedules(params, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedules.');
    } finally {
      setLoading(false);
    }
  }, [token, page, filters, view, weekStart]);

  const loadOptions = useCallback(async () => {
    if (!token) return;
    try {
      const [empRes, shiftRes] = await Promise.all([
        listEmployees({ per_page: 100, is_active: '1' }, token),
        listShifts({ per_page: 100, is_active: '1' }, token),
      ]);
      setEmployees(empRes.data);
      setShifts(shiftRes.data);
    } catch {
      notify('error', 'Could not load employees or shifts.');
    }
  }, [token, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!isBranchManager && token) {
      listBranches({ per_page: 100 }, token)
        .then((r) => setBranches(r.data))
        .catch(() => setBranches([]));
    }
  }, [isBranchManager, token]);

  function applyFilter(patch: Partial<FilterState>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setFieldErrors({});
    try {
      await createSchedule(
        { employee_id: Number(form.employee_id), shift_id: Number(form.shift_id), date: form.date },
        token,
      );
      notify('success', 'Schedule created.');
      setModalOpen(false);
      setForm({ employee_id: '', shift_id: '', date: '' });
      void load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        notify('error', err.message);
      } else {
        notify('error', 'Unexpected error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!token || !deleting) return;
    setDeleteBusy(true);
    try {
      await deleteSchedule(deleting.id, token);
      notify('success', 'Schedule removed.');
      setDeleting(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to remove the schedule.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleBulkAssign() {
    if (!token || !bulkForm.shift_id || !bulkForm.date || bulkForm.employee_ids.length === 0) {
      notify('error', 'Select employees, a shift, and a date.');
      return;
    }
    setSaving(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const id of bulkForm.employee_ids) {
        try {
          await createSchedule(
            { employee_id: Number(id), shift_id: Number(bulkForm.shift_id), date: bulkForm.date },
            token,
          );
          ok++;
        } catch {
          fail++;
        }
      }
      notify(fail ? 'error' : 'success', `Assigned ${ok} schedule(s)${fail ? `, ${fail} failed` : ''}.`);
      setBulkOpen(false);
      void load();
    } finally {
      setSaving(false);
    }
  }

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleAdmin[]>();
    for (const s of data ?? []) {
      const key = s.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Schedules"
        description="Assign shifts to employees on specific dates"
        actions={
          <>
            <div className="flex rounded-lg border border-border bg-white p-0.5">
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer',
                  view === 'list' ? 'bg-primary text-white' : 'text-muted hover:text-text',
                )}
              >
                <List size={14} /> List
              </button>
              <button
                type="button"
                onClick={() => setView('week')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer',
                  view === 'week' ? 'bg-primary text-white' : 'text-muted hover:text-text',
                )}
              >
                <CalendarDays size={14} /> Week
              </button>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setBulkForm({ employee_ids: [], shift_id: '', date: toLocalDateInput() });
                setBulkOpen(true);
              }}
            >
              Bulk assign
            </Button>
            <Button
              onClick={() => {
                setForm({ employee_id: '', shift_id: '', date: '' });
                setFieldErrors({});
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              Add schedule
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
          <ListFilter size={14} />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {view === 'list' && (
            <Field label="Date">
              <Input type="date" value={filters.date} onChange={(e) => applyFilter({ date: e.target.value })} />
            </Field>
          )}
          <Field label="Employee">
            <Select value={filters.employee_id} onChange={(e) => applyFilter({ employee_id: e.target.value })}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift">
            <Select value={filters.shift_id} onChange={(e) => applyFilter({ shift_id: e.target.value })}>
              <option value="">All shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {!isBranchManager && (
            <Field label="Branch">
              <Select value={filters.branch_id} onChange={(e) => applyFilter({ branch_id: e.target.value })}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(filters.date || filters.employee_id || filters.shift_id || filters.branch_id) && (
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setFilters(EMPTY_FILTER);
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </Card>

      {view === 'week' && (
        <Card className="mb-4 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft size={16} />
            </Button>
            <div className="text-sm font-semibold text-text">
              {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight size={16} />
            </Button>
          </div>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-7 md:divide-x md:divide-y-0">
              {weekDays.map((day) => {
                const items = byDate.get(day) ?? [];
                return (
                  <div key={day} className="min-h-36 p-2">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{formatDate(day)}</div>
                    <div className="space-y-1.5">
                      {loading && !data ? (
                        <div className="h-8 animate-pulse rounded bg-slate-100" />
                      ) : items.length === 0 ? (
                        <div className="text-[11px] text-muted">—</div>
                      ) : (
                        items.map((s) => (
                          <div key={s.id} className="rounded-md border border-border bg-slate-50 px-1.5 py-1">
                            <Badge tone={shiftTone(s.shift?.name ?? 'x')} className="mb-0.5 max-w-full truncate">
                              {s.shift?.name ?? 'Shift'}
                            </Badge>
                            <div className="truncate text-[11px] font-medium text-text">{s.employee?.name}</div>
                            <div className="font-mono text-[10px] tnum text-muted">
                              {formatClockTime(s.shift?.start_time)}–{formatClockTime(s.shift?.end_time)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {view === 'list' && (
      <Card className="shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<ScheduleAdmin>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No schedules found"
              emptyDescription="Adjust the filters or add a schedule."
              columns={[
                { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap text-sm text-text">{formatDate(r.date)}</span> },
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => (
                    <div>
                      <div className="text-sm font-medium text-text">{r.employee?.name}</div>
                      <div className="text-xs text-muted">
                        {r.employee?.department ?? '—'}
                        {r.employee?.branch_id ? ` · Branch #${r.employee.branch_id}` : ''}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'shift',
                  header: 'Shift',
                  render: (r) =>
                    r.shift ? (
                      <div>
                        <div className="text-sm text-text">{r.shift.name}</div>
                        <div className="text-xs text-muted">
                          {formatClockTime(r.shift.start_time)} – {formatClockTime(r.shift.end_time)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    ),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-16',
                  render: (r) => (
                    <button
                      type="button"
                      onClick={() => setDeleting(r)}
                      className="rounded p-1.5 text-muted hover:bg-bg hover:text-danger cursor-pointer"
                      title="Remove"
                      aria-label={`Remove schedule for ${r.employee.name} on ${formatDate(r.date)}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ),
                },
              ]}
            />
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
          </>
        )}
      </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add schedule">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
          <Field label="Employee" required error={fieldErrors.employee_id?.[0]}>
            <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.full_name}
                  {e.employee_id ? ` (${e.employee_id})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift" required error={fieldErrors.shift_id?.[0]}>
            <Select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })}>
              <option value="">Select shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({formatClockTime(s.start_time)} – {formatClockTime(s.end_time)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required error={fieldErrors.date?.[0]}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk assign shift" wide>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Shift" required>
            <Select value={bulkForm.shift_id} onChange={(e) => setBulkForm({ ...bulkForm, shift_id: e.target.value })}>
              <option value="">Select shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={bulkForm.date} onChange={(e) => setBulkForm({ ...bulkForm, date: e.target.value })} />
          </Field>
          <Field label="Employees" required>
            <select
              multiple
              value={bulkForm.employee_ids}
              onChange={(e) =>
                setBulkForm({
                  ...bulkForm,
                  employee_ids: Array.from(e.target.selectedOptions).map((o) => o.value),
                })
              }
              className="min-h-40 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted">Hold Ctrl/Cmd to select multiple.</span>
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void handleBulkAssign()}>
              Assign to selected
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove schedule"
        confirmLabel="Remove"
        danger
        loading={deleteBusy}
        message={
          <>
            Remove the <strong>{deleting?.shift?.name}</strong> shift for <strong>{deleting?.employee?.name}</strong> on{' '}
            <strong>{deleting ? formatDate(deleting.date) : ''}</strong>?
          </>
        }
      />
    </div>
  );
}
