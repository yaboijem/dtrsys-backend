import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { createSchedule, deleteSchedule, listBranches, listEmployees, listSchedules, listShifts } from '../api/endpoints';
import type { Branch, Employee, Paginated, ScheduleAdmin, Shift } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorState, Field, Input, Select } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatDate, formatClockTime } from '../lib/format';

interface FilterState {
  date: string;
  employee_id: string;
  shift_id: string;
  branch_id: string;
}

const EMPTY_FILTER: FilterState = { date: '', employee_id: '', shift_id: '', branch_id: '' };

export function SchedulesPage() {
  const { token, user } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);
  const [data, setData] = useState<ScheduleAdmin[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', shift_id: '', date: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ScheduleAdmin | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isBranchManager = user?.roles.includes('Branch Manager') ?? false;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filters.date) params.date = filters.date;
      if (filters.employee_id) params.employee_id = filters.employee_id;
      if (filters.shift_id) params.shift_id = filters.shift_id;
      if (filters.branch_id) params.branch_id = filters.branch_id;
      const result = await listSchedules({ ...params, page, per_page: 20 }, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedules.');
    } finally {
      setLoading(false);
    }
  }, [token, page, filters]);

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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Schedules</h1>
          <p className="text-xs text-muted">Assign shifts to employees on specific dates</p>
        </div>
        <Button onClick={() => { setForm({ employee_id: '', shift_id: '', date: '' }); setFieldErrors({}); setModalOpen(true); }}>
          <Plus size={15} />
          Add schedule
        </Button>
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Field label="Date">
            <Input type="date" value={filters.date} onChange={(e) => applyFilter({ date: e.target.value })} />
          </Field>
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
          {filters.date || filters.employee_id || filters.shift_id || filters.branch_id ? (
            <div className="flex items-end pb-1">
              <Button variant="secondary" onClick={() => { setFilters(EMPTY_FILTER); setPage(1); }}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
      </Card>

      <Card>
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
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
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
            Remove the <strong>{deleting?.shift?.name}</strong> shift for <strong>{deleting?.employee?.name}</strong> on <strong>{deleting ? formatDate(deleting.date) : ''}</strong>?
          </>
        }
      />
    </div>
  );
}
