import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { createBranch, deleteBranch, listBranches, updateBranch } from '../api/endpoints';
import type { Branch, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState, Field, Input, Toggle } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

interface FormState {
  name: string;
  code: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  is_active: boolean;
}

function emptyForm(): FormState {
  return { name: '', code: '', address: '', latitude: '', longitude: '', radius_meters: '300', is_active: true };
}

export function BranchesPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Branch[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Branch | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listBranches({ page, per_page: 20 }, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load branches.');
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

  function openEdit(branch: Branch) {
    setEditing(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? '',
      latitude: String(branch.latitude),
      longitude: String(branch.longitude),
      radius_meters: String(branch.radius_meters),
      is_active: branch.is_active,
    });
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        address: form.address.trim() || null,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius_meters: Number(form.radius_meters),
        is_active: form.is_active,
      };
      if (editing) {
        await updateBranch(editing.id, payload, token);
        notify('success', 'Branch updated.');
      } else {
        await createBranch(payload, token);
        notify('success', 'Branch created.');
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
      await deleteBranch(deleting.id, token);
      notify('success', 'Branch deleted.');
      setDeleting(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to delete the branch.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Branches</h1>
          <p className="text-xs text-muted">Locations and GPS geo-fencing settings</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} />
          Add branch
        </Button>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<Branch>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No branches yet"
              emptyDescription="Create your first branch to start assigning employees."
              columns={[
                {
                  key: 'name',
                  header: 'Branch',
                  render: (r) => (
                    <div>
                      <div className="font-medium text-text">{r.name}</div>
                      <div className="text-xs text-muted">{r.code}</div>
                    </div>
                  ),
                },
                { key: 'address', header: 'Address', render: (r) => <span className="text-xs text-muted">{r.address ?? '—'}</span> },
                {
                  key: 'coords',
                  header: 'Coordinates',
                  render: (r) => (
                    <span className="font-mono text-xs text-text">
                      {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                    </span>
                  ),
                },
                { key: 'radius', header: 'Radius', render: (r) => <span className="text-xs text-muted">{r.radius_meters} m</span> },
                { key: 'employees', header: 'Employees', render: (r) => <span className="text-sm text-text">{r.employee_count}</span> },
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
                      <button type="button" onClick={() => openEdit(r)} className="rounded p-1.5 text-muted hover:bg-bg hover:text-primary cursor-pointer" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleting(r)} className="rounded p-1.5 text-muted hover:bg-bg hover:text-danger cursor-pointer" title="Delete">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add branch'}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required error={fieldErrors.name?.[0]}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Code" required error={fieldErrors.code?.[0]}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. MKT" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" error={fieldErrors.address?.[0]}>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
          <Field label="Latitude" required error={fieldErrors.latitude?.[0]}>
            <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
          </Field>
          <Field label="Longitude" required error={fieldErrors.longitude?.[0]}>
            <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
          </Field>
          <Field label="Radius (meters)" required error={fieldErrors.radius_meters?.[0]}>
            <Input type="number" min="1" max="10000" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2">
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
            <span className="text-sm text-text">Branch active</span>
          </div>
          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Create branch'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete branch"
        confirmLabel="Delete"
        danger
        loading={deleteBusy}
        message={
          <>
            Delete <strong>{deleting?.name}</strong>? This cannot be undone. Branches with employees assigned cannot be deleted.
          </>
        }
      />
    </div>
  );
}
