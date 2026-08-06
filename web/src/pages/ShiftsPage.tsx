import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Coffee, Clock, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { createShift, deleteShift, getAppSettings, listShifts, updateAppSettings, updateShift } from '../api/endpoints';
import type { Paginated, Shift } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, ErrorState, Field, Input, Spinner, Toggle } from '../components/ui';
import { PaginationBar } from '../components/DataTable';
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

  const [breaksEnabled, setBreaksEnabled] = useState<boolean | null>(null);
  const [breaksToggleBusy, setBreaksToggleBusy] = useState(false);

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

  useEffect(() => {
    if (!token) return;
    void getAppSettings(token)
      .then((s) => setBreaksEnabled(s.breaks_enabled))
      .catch(() => {
        /* leave null; toggle hidden until known */
      });
  }, [token]);

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

  async function toggleActive(shift: Shift) {
    if (!token) return;
    try {
      await updateShift(shift.id, { is_active: !shift.is_active }, token);
      notify('success', shift.is_active ? 'Shift deactivated.' : 'Shift activated.');
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to update shift.');
    }
  }

  async function toggleBreaksEnabled() {
    if (!token || breaksEnabled === null || breaksToggleBusy) return;
    const next = !breaksEnabled;
    const prev = breaksEnabled;
    setBreaksEnabled(next);
    setBreaksToggleBusy(true);
    try {
      const s = await updateAppSettings({ breaks_enabled: next }, token);
      setBreaksEnabled(s.breaks_enabled);
      notify('success', s.breaks_enabled ? 'Break in/out enabled.' : 'Break in/out disabled.');
    } catch (err) {
      setBreaksEnabled(prev);
      notify('error', err instanceof ApiError ? err.message : 'Failed to update break setting.');
    } finally {
      setBreaksToggleBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Shifts"
        description="Working hours, grace periods and breaks. When break in/out is off, employees cannot start a break; anyone already on break can still end it."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {breaksEnabled !== null ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5">
                <Toggle
                  checked={breaksEnabled}
                  onChange={() => void toggleBreaksEnabled()}
                  disabled={breaksToggleBusy}
                  label="Break in/out"
                />
                <span className="text-sm text-text">Break in/out</span>
              </div>
            ) : null}
            <Button onClick={openCreate}>
              <Plus size={15} />
              Create new shift
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !data ? (
        <Spinner label="Loading shifts…" />
      ) : !data?.length ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-text">No shifts yet</p>
          <p className="mt-1 text-xs text-muted">Create a shift definition to use in schedules.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus size={15} /> Create new shift
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((r) => (
              <Card key={r.id} className="flex flex-col p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold text-text">{r.name}</div>
                    <div className="mt-0.5 font-mono text-sm tnum text-muted">
                      {formatClockTime(r.start_time)} – {formatClockTime(r.end_time)}
                    </div>
                  </div>
                  <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="mb-4 space-y-2 text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-primary" />
                    <span>Working hours</span>
                    <span className="ml-auto font-mono tnum text-text">
                      {formatClockTime(r.start_time)} – {formatClockTime(r.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Timer size={14} className="text-warning" />
                    <span>Grace period</span>
                    <span className="ml-auto font-mono tnum text-text">
                      {r.grace_minutes != null ? `${r.grace_minutes} min` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Coffee size={14} className="text-teal-700" />
                    <span>Break</span>
                    <span className="ml-auto font-mono tnum text-text">
                      {r.break_start && r.break_end
                        ? `${formatClockTime(r.break_start)} – ${formatClockTime(r.break_end)}`
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                  <div className="flex items-center gap-2">
                    <Toggle checked={r.is_active} onChange={() => void toggleActive(r)} label={`Toggle ${r.name}`} />
                    <span className="text-xs text-muted">Active</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-primary cursor-pointer"
                      aria-label={`Edit ${r.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(r)}
                      className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-danger cursor-pointer"
                      aria-label={`Delete ${r.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {paginated && (
            <Card className="mt-4 shadow-sm">
              <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />
            </Card>
          )}
        </>
      )}

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
