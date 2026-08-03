import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { createShift, deleteShift, listShifts, updateShift } from '../api/endpoints';
import type { Paginated, Shift } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState, Field, Input, Toggle } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatClockTime } from '../lib/format';

interface FormState {
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: string;
  break_start: string;
  break_end: string;
  is_active: boolean;
}

function emptyForm(): FormState {
  return { name: '', start_time: '', end_time: '', grace_minutes: '', break_start: '', break_end: '', is_active: true };
}

function toSeconds(value: string): string | null {
  return value ? `${value}:00` : null;
}

function fromSeconds(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '';
}

export function ShiftsPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Shift[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listShifts({ page, per_page: 20 }, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load shifts.');
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEdit(shift: Shift) {
    setEditing(shift);
    setForm({
      name: shift.name,
      start_time: fromSeconds(shift.start_time),
      end_time: fromSeconds(shift.end_time),
      grace_minutes: shift.grace_minutes !== null && shift.grace_minutes !== undefined ? String(shift.grace_minutes) : '',
      break_start: fromSeconds(shift.break_start),
      break_end: fromSeconds(shift.break_end),
      is_active: shift.is_active,
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.start_time || !form.end_time) {
      setFieldErrors({
        ...(!form.start_time ? { start_time: ['Start time is required.'] } : {}),
        ...(!form.end_time ? { end_time: ['End time is required.'] } : {}),
      });
      notify('error', 'Start and end time are required.');
      return;
    }
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        start_time: toSeconds(form.start_time) ?? '00:00:00',
        end_time: toSeconds(form.end_time) ?? '00:00:00',
        grace_minutes: form.grace_minutes ? Number(form.grace_minutes) : null,
        break_start: toSeconds(form.break_start),
        break_end: toSeconds(form.break_end),
        is_active: form.is_active,
      };
      if (editing) {
        await updateShift(editing.id, payload, token);
        notify('success', 'Shift updated.');
      } else {
        await createShift(payload, token);
        notify('success', 'Shift created.');
      }
      setModalOpen(false);
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
      await deleteShift(deleting.id, token);
      notify('success', 'Shift deleted.');
      setDeleting(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to delete the shift.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Shifts</h1>
          <p className="text-xs text-muted">Working hours, grace periods and breaks</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} />
          Add shift
        </Button>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<Shift>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No shifts yet"
              emptyDescription="Create a shift definition to use in schedules."
              columns={[
                { key: 'name', header: 'Shift', render: (r) => <span className="font-medium text-text">{r.name}</span> },
                {
                  key: 'hours',
                  header: 'Hours',
                  render: (r) => (
                    <span className="whitespace-nowrap text-sm text-text">
                      {formatClockTime(r.start_time)} – {formatClockTime(r.end_time)}
                    </span>
                  ),
                },
                {
                  key: 'grace',
                  header: 'Grace',
                  render: (r) => <span className="text-xs text-muted">{r.grace_minutes !== null && r.grace_minutes !== undefined ? `${r.grace_minutes} min` : '—'}</span>,
                },
                {
                  key: 'break',
                  header: 'Break',
                  render: (r) => (
                    <span className="text-xs text-muted">
                      {r.break_start && r.break_end ? `${formatClockTime(r.break_start)} – ${formatClockTime(r.break_end)}` : '—'}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-20',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`} className="rounded p-1.5 text-muted hover:bg-bg hover:text-primary cursor-pointer" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`} className="rounded p-1.5 text-muted hover:bg-bg hover:text-danger cursor-pointer" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add shift'}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Shift name" required error={fieldErrors.name?.[0]}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning shift" />
            </Field>
          </div>
          <Field label="Start time" required error={fieldErrors.start_time?.[0]}>
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="End time" required error={fieldErrors.end_time?.[0]}>
            <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </Field>
          <Field label="Grace period (minutes)" error={fieldErrors.grace_minutes?.[0]}>
            <Input type="number" min="0" max="240" value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: e.target.value })} />
          </Field>
          <div className="flex items-end gap-3">
            <Field label="Break start" error={fieldErrors.break_start?.[0]}>
              <Input type="time" value={form.break_start} onChange={(e) => setForm({ ...form, break_start: e.target.value })} />
            </Field>
            <Field label="Break end" error={fieldErrors.break_end?.[0]}>
              <Input type="time" value={form.break_end} onChange={(e) => setForm({ ...form, break_end: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Shift active" />
            <span className="text-sm text-text">Shift active</span>
          </div>
          <div className="mt-4 flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Create shift'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete shift"
        confirmLabel="Delete"
        danger
        loading={deleteBusy}
        message={
          <>
            Delete <strong>{deleting?.name}</strong>? Shifts still assigned to schedules cannot be deleted.
          </>
        }
      />
    </div>
  );
}
