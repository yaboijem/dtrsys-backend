import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  createEmployee,
  deactivateEmployee,
  listBranches,
  listDepartments,
  listEmployees,
  listPositions,
  updateEmployee,
  uploadReferencePhoto,
} from '../api/endpoints';
import type { Branch, Department, Employee, Paginated, Position } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { SearchableSelect } from '../components/SearchableSelect';
import { Avatar, Badge, Button, Card, ErrorState, Field, Input, Select, Toggle } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { DropdownItem, DropdownMenu } from '../components/DropdownMenu';
import { ConfirmDialog, Modal } from '../components/Modal';
import { PhotoViewer } from '../components/PhotoViewer';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/format';

const ROLES = ['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'];

interface Filters {
  search: string;
  branch_id: string;
  department_id: string;
}

interface FormState {
  employee_id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  branch_id: string;
  work_arrangement: 'onsite' | 'wfh' | 'hybrid';
  first_name: string;
  middle_name: string;
  last_name: string;
  department_id: string;
  position_id: string;
  date_hired: string;
  is_active: boolean;
}

function emptyForm(): FormState {
  return {
    employee_id: '',
    name: '',
    email: '',
    password: '',
    role: 'Employee',
    branch_id: '',
    work_arrangement: 'onsite',
    first_name: '',
    middle_name: '',
    last_name: '',
    department_id: '',
    position_id: '',
    date_hired: '',
    is_active: true,
  };
}

function composeFullName(firstName: string, middleName: string, lastName: string): string {
  return [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

export function EmployeesPage() {
  const { token, user, refreshUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({ search: '', branch_id: '', department_id: '' });
  const [applied, setApplied] = useState<Filters>({ search: '', branch_id: '', department_id: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Employee[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listBranches({ per_page: 100 }, token);
      setBranches(result.data);
    } catch {
      setBranches([]);
    }
  }, [token]);

  const loadMasterData = useCallback(async () => {
    if (!token) return;
    try {
      const [deptResult, posResult] = await Promise.all([
        listDepartments({ per_page: 100 }, token),
        listPositions({ per_page: 100 }, token),
      ]);
      setDepartments(deptResult.data);
      setPositions(posResult.data);
    } catch {
      setDepartments([]);
      setPositions([]);
    }
  }, [token]);

  useEffect(() => {
    void loadBranches();
    void loadMasterData();
  }, [loadBranches, loadMasterData]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, per_page: 20 };
      if (applied.search) params.search = applied.search;
      if (applied.branch_id) params.branch_id = applied.branch_id;
      if (applied.department_id) params.department_id = applied.department_id;
      const result = await listEmployees(params, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load employees.');
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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setPhotoFile(null);
    setModalOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setForm({
      employee_id: employee.employee_id,
      name: composeFullName(employee.first_name, employee.middle_name ?? '', employee.last_name),
      email: employee.email,
      password: '',
      role: employee.roles?.[0] ?? 'Employee',
      branch_id: employee.branch ? String(employee.branch.id) : '',
      work_arrangement:
        employee.work_arrangement === 'wfh' || employee.work_arrangement === 'hybrid'
          ? employee.work_arrangement
          : 'onsite',
      first_name: employee.first_name,
      middle_name: employee.middle_name ?? '',
      last_name: employee.last_name,
      department_id: employee.department_id != null ? String(employee.department_id) : '',
      position_id: employee.position_id != null ? String(employee.position_id) : '',
      date_hired: employee.date_hired ?? '',
      is_active: employee.is_active,
    });
    setFieldErrors({});
    setPhotoFile(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setFieldErrors({});
    try {
      if (!form.department_id || !form.position_id) {
        setFieldErrors({
          ...(!form.department_id ? { department_id: ['Department is required.'] } : {}),
          ...(!form.position_id ? { position_id: ['Position is required.'] } : {}),
        });
        setSaving(false);
        return;
      }
      const payload = {
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        branch_id: Number(form.branch_id),
        work_arrangement: form.work_arrangement,
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        department_id: Number(form.department_id),
        position_id: Number(form.position_id),
        date_hired: form.date_hired || null,
        is_active: form.is_active,
        ...(form.password ? { password: form.password } : {}),
      };
      if (editing) {
        await updateEmployee(editing.id, payload, token);
        const isSelf =
          user != null && (editing.user_id === user.id || editing.id === user.employee?.id);
        if (isSelf) {
          await refreshUser();
        }
        notify('success', 'Employee updated.');
      } else {
        await createEmployee(payload as Parameters<typeof createEmployee>[0], token);
        notify('success', 'Employee created.');
      }
      setModalOpen(false);
      setPhotoFile(null);
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

  async function handlePhotoUpload() {
    if (!token || !editing || !photoFile) return;
    setPhotoUploading(true);
    try {
      const updated = await uploadReferencePhoto(editing.id, photoFile, token);
      setEditing(updated);
      setPhotoFile(null);
      setData((prev) => (prev ? prev.map((e) => (e.id === updated.id ? updated : e)) : prev));
      notify('success', 'Reference photo updated.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to upload the photo.');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleDeactivate() {
    if (!token || !deactivating) return;
    setDeactivateBusy(true);
    try {
      await deactivateEmployee(deactivating.id, token);
      notify('success', `${deactivating.full_name} deactivated.`);
      setDeactivating(null);
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to deactivate the employee.');
    } finally {
      setDeactivateBusy(false);
    }
  }

  const branchName = (id: number | null | undefined) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Manage accounts, roles and reference photos"
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} />
            Add employee
          </Button>
        }
      />

      <Card className="mb-4 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search name or employee ID…"
              className="pl-9"
            />
          </div>
          <Select value={filters.branch_id} onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })} className="lg:w-44">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <div className="min-w-0 lg:w-52">
            <SearchableSelect
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              value={filters.department_id}
              onChange={(department_id) => setFilters({ ...filters, department_id })}
              placeholder="All departments"
              emptyLabel="All departments"
              allowEmpty
              searchPlaceholder="Search departments…"
            />
          </div>
          <Button onClick={applyFilters} disabled={!dirty} className="shrink-0 lg:self-auto">
            Apply
          </Button>
        </div>
      </Card>

      <Card className="shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<Employee>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No employees found"
              emptyDescription="Adjust the search or filters and try again."
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => (
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.full_name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text">{r.full_name}</div>
                        <div className="truncate text-xs text-muted">{r.position || '—'}</div>
                        <div className="font-mono text-[11px] tnum text-muted">{r.employee_id}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'tags',
                  header: 'Org',
                  render: (r) => (
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="teal">{branchName(r.branch?.id)}</Badge>
                      <Badge tone={r.work_arrangement === 'onsite' || !r.work_arrangement ? 'gray' : 'violet'}>
                        {r.work_arrangement === 'wfh'
                          ? 'WFH'
                          : r.work_arrangement === 'hybrid'
                            ? 'Hybrid'
                            : 'Onsite'}
                      </Badge>
                      {r.department ? <Badge tone="gray">{r.department}</Badge> : null}
                      <Badge tone={r.roles?.[0] === 'Super Admin' ? 'violet' : 'blue'}>{r.roles?.[0] ?? '—'}</Badge>
                    </div>
                  ),
                },
                {
                  key: 'hired',
                  header: 'Hired',
                  render: (r) => <span className="font-mono text-xs tnum text-muted">{formatDate(r.date_hired)}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Deactivated</Badge>),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-14',
                  render: (r) => (
                    <DropdownMenu
                      trigger={
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-text cursor-pointer"
                          aria-label={`Actions for ${r.full_name}`}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      }
                    >
                      <DropdownItem onSelect={() => openEdit(r)}>Edit details</DropdownItem>
                      <DropdownItem onSelect={() => navigate(`/attendance?employee_id=${r.id}`)}>View attendance</DropdownItem>
                      {r.is_active ? (
                        <DropdownItem danger onSelect={() => setDeactivating(r)}>
                          Deactivate
                        </DropdownItem>
                      ) : null}
                    </DropdownMenu>
                  ),
                },
              ]}
            />
            {paginated && <PaginationBar page={page} paginated={paginated} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.full_name}` : 'Add employee'} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3.5">
          <Field label="Employee ID" required error={fieldErrors.employee_id?.[0]}>
            <Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} disabled={!!editing} />
          </Field>
          <Field label="Full name" required error={fieldErrors.name?.[0]}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled />
          </Field>
          <Field label="Email" required error={fieldErrors.email?.[0]}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={editing ? 'Password (leave blank to keep)' : 'Password'} required={!editing} error={fieldErrors.password?.[0]}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Role" required error={fieldErrors.role?.[0]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Branch" required error={fieldErrors.branch_id?.[0]}>
            <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work arrangement" error={fieldErrors.work_arrangement?.[0]}>
            <Select
              value={form.work_arrangement}
              onChange={(e) => setForm({ ...form, work_arrangement: e.target.value as 'onsite' | 'wfh' | 'hybrid' })}
            >
              <option value="onsite">Onsite</option>
              <option value="wfh">WFH</option>
              <option value="hybrid">Hybrid</option>
            </Select>
          </Field>
          <Field label="First name" required error={fieldErrors.first_name?.[0]}>
            <Input
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value, name: composeFullName(e.target.value, form.middle_name, form.last_name) })
              }
            />
          </Field>
          <Field label="Middle name" error={fieldErrors.middle_name?.[0]}>
            <Input
              value={form.middle_name}
              onChange={(e) =>
                setForm({ ...form, middle_name: e.target.value, name: composeFullName(form.first_name, e.target.value, form.last_name) })
              }
            />
          </Field>
          <Field label="Last name" required error={fieldErrors.last_name?.[0]}>
            <Input
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value, name: composeFullName(form.first_name, form.middle_name, e.target.value) })
              }
            />
          </Field>
          <Field label="Department" required error={fieldErrors.department_id?.[0]}>
            <SearchableSelect
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              value={form.department_id}
              onChange={(department_id) => setForm({ ...form, department_id })}
              placeholder="Select department"
              searchPlaceholder="Search departments…"
              allowEmpty={false}
              noneMatchLabel={
                departments.length === 0
                  ? 'No departments yet — add them under Org structure.'
                  : 'No matches.'
              }
            />
          </Field>
          <Field label="Position" required error={fieldErrors.position_id?.[0]}>
            <SearchableSelect
              options={positions.map((p) => ({ value: String(p.id), label: p.name }))}
              value={form.position_id}
              onChange={(position_id) => setForm({ ...form, position_id })}
              placeholder="Select position"
              searchPlaceholder="Search positions…"
              allowEmpty={false}
              noneMatchLabel={
                positions.length === 0
                  ? 'No positions yet — add them under Org structure.'
                  : 'No matches.'
              }
            />
          </Field>
          <Field label="Date hired" error={fieldErrors.date_hired?.[0]}>
            <Input type="date" value={form.date_hired} onChange={(e) => setForm({ ...form, date_hired: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Account active" />
            <span className="text-sm text-text">Account active</span>
          </div>

          {editing && (
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs font-semibold text-muted">Reference photo</div>
              <div className="flex items-center gap-4">
                <PhotoViewer
                  url={`/api/admin/employees/${editing.id}/reference-photo`}
                  token={token ?? ''}
                  alt="Reference photo"
                  className="h-28 w-28 rounded-md border border-border"
                />
                <div className="flex-1 space-y-2">
                  <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
                  <Button variant="secondary" onClick={handlePhotoUpload} disabled={!photoFile || photoUploading} loading={photoUploading}>
                    Upload photo
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Create employee'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={handleDeactivate}
        title="Deactivate employee"
        confirmLabel="Deactivate"
        danger
        loading={deactivateBusy}
        message={
          <>
            Deactivate <strong>{deactivating?.full_name}</strong>? They will no longer be able to sign in to the mobile app. Their attendance history is kept.
          </>
        }
      />
    </div>
  );
}
