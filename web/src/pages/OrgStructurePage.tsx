import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  createDepartment,
  createPosition,
  deleteDepartment,
  deletePosition,
  listDepartments,
  listPositions,
  updateDepartment,
  updatePosition,
} from '../api/endpoints';
import type { Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, ErrorState, Field, Input } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

type MasterItem = { id: number; name: string; employees_count?: number };

function MasterSection({
  title,
  entityLabel,
  token,
  listFn,
  createFn,
  updateFn,
  deleteFn,
}: {
  title: string;
  entityLabel: string;
  token: string;
  listFn: (params: { page: number; per_page: number }, token: string) => Promise<Paginated<MasterItem>>;
  createFn: (payload: { name: string }, token: string) => Promise<MasterItem>;
  updateFn: (id: number, payload: { name: string }, token: string) => Promise<MasterItem>;
  deleteFn: (id: number, token: string) => Promise<{ message: string }>;
}) {
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MasterItem[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<MasterItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({ page, per_page: 20 }, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [token, page, listFn, title]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName('');
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEdit(item: MasterItem) {
    setEditing(item);
    setName(item.name);
    setFieldErrors({});
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = { name: name.trim() };
      if (editing) {
        await updateFn(editing.id, payload, token);
        notify('success', `${entityLabel} updated.`);
      } else {
        await createFn(payload, token);
        notify('success', `${entityLabel} created.`);
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
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteFn(deleting.id, token);
      notify('success', `${entityLabel} deleted.`);
      setDeleting(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : `Failed to delete ${entityLabel.toLowerCase()}.`);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <Button onClick={openCreate}>
          <Plus size={15} />
          Add
        </Button>
      </div>

      {error ? (
        <div className="p-4 sm:p-5">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : (
        <>
          <DataTable<MasterItem>
            loading={loading && !data}
            rows={data ?? []}
            keyOf={(r) => r.id}
            emptyTitle={`No ${title.toLowerCase()} yet`}
            emptyDescription={`Add a ${entityLabel.toLowerCase()} to assign on employee records.`}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (r) => <span className="font-medium text-text">{r.name}</span>,
              },
              {
                key: 'employees',
                header: 'Employees',
                render: (r) => <span className="text-sm text-text">{r.employees_count ?? 0}</span>,
              },
              {
                key: 'actions',
                header: '',
                className: 'w-20',
                render: (r) => (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      aria-label={`Edit ${r.name}`}
                      className="rounded p-1.5 text-muted hover:bg-bg hover:text-primary cursor-pointer"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(r)}
                      aria-label={`Delete ${r.name}`}
                      className="rounded p-1.5 text-muted hover:bg-bg hover:text-danger cursor-pointer"
                      title="Delete"
                    >
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${entityLabel.toLowerCase()}` : `Add ${entityLabel.toLowerCase()}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" required error={fieldErrors.name?.[0]}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Delete ${entityLabel.toLowerCase()}`}
        confirmLabel="Delete"
        danger
        loading={deleteBusy}
        message={
          <>
            Delete <strong>{deleting?.name}</strong>? Items assigned to employees cannot be deleted.
          </>
        }
      />
    </Card>
  );
}

export function OrgStructurePage() {
  const { token } = useAuth();
  if (!token) return null;

  return (
    <div>
      <PageHeader
        title="Org structure"
        description="Manage departments and positions used on employee records"
      />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:gap-6">
        <MasterSection
          title="Departments"
          entityLabel="Department"
          token={token}
          listFn={listDepartments as typeof listDepartments}
          createFn={createDepartment}
          updateFn={(id, payload, t) => updateDepartment(id, payload, t)}
          deleteFn={deleteDepartment}
        />
        <MasterSection
          title="Positions"
          entityLabel="Position"
          token={token}
          listFn={listPositions as typeof listPositions}
          createFn={createPosition}
          updateFn={(id, payload, t) => updatePosition(id, payload, t)}
          deleteFn={deletePosition}
        />
      </div>
    </div>
  );
}
