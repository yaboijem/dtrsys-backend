import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, ListFilter, Smartphone, FileText } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  listDataRequests,
  listDeviceChangeRequests,
  reviewDataRequest,
  reviewDeviceChangeRequest,
} from '../api/endpoints';
import type {
  DataRequest,
  DataRequestStatus,
  DataRequestType,
  DeviceChangeRequest,
  DeviceChangeRequestStatus,
  Paginated,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState, Field, Select, Textarea } from '../components/ui';
import { DataTable, PaginationBar } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { useToast } from '../components/Toast';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';

type Tab = 'device' | 'data';

const REQUEST_STATUS_TONES: Record<DeviceChangeRequestStatus, 'amber' | 'green' | 'gray'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'gray',
};

const DATA_STATUS_TONES: Record<DataRequestStatus, 'amber' | 'green' | 'gray'> = {
  pending: 'amber',
  completed: 'green',
  rejected: 'gray',
};

const DATA_TYPE_TONES: Record<DataRequestType, 'blue' | 'violet'> = {
  access: 'blue',
  deletion: 'violet',
};

interface DeviceFilters {
  status: string;
}

interface DataFilters {
  status: string;
  type: string;
}

const EMPTY_DEVICE_FILTERS: DeviceFilters = { status: 'pending' };
const EMPTY_DATA_FILTERS: DataFilters = { status: 'pending', type: '' };

export function PendingRequestsPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('device');
  const [deviceFilters, setDeviceFilters] = useState<DeviceFilters>(EMPTY_DEVICE_FILTERS);
  const [deviceApplied, setDeviceApplied] = useState<DeviceFilters>(EMPTY_DEVICE_FILTERS);
  const [dataFilters, setDataFilters] = useState<DataFilters>(EMPTY_DATA_FILTERS);
  const [dataApplied, setDataApplied] = useState<DataFilters>(EMPTY_DATA_FILTERS);
  const [devicePage, setDevicePage] = useState(1);
  const [dataPage, setDataPage] = useState(1);
  const [deviceData, setDeviceData] = useState<DeviceChangeRequest[] | null>(null);
  const [dataData, setDataData] = useState<DataRequest[] | null>(null);
  const [devicePaginated, setDevicePaginated] = useState<Paginated<unknown> | null>(null);
  const [dataPaginated, setDataPaginated] = useState<Paginated<unknown> | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<DeviceChangeRequest | null>(null);
  const [selectedData, setSelectedData] = useState<DataRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadDevice = useCallback(async () => {
    if (!token) return;
    setDeviceLoading(true);
    setDeviceError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page: devicePage, per_page: 20 };
      if (deviceApplied.status) params.status = deviceApplied.status;
      const result = await listDeviceChangeRequests(params, token);
      setDeviceData(result.data);
      setDevicePaginated(result);
    } catch (err) {
      setDeviceError(err instanceof ApiError ? err.message : 'Failed to load device requests.');
    } finally {
      setDeviceLoading(false);
    }
  }, [token, devicePage, deviceApplied]);

  useEffect(() => {
    void loadDevice();
  }, [loadDevice]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page: dataPage, per_page: 20 };
      if (dataApplied.status) params.status = dataApplied.status;
      if (dataApplied.type) params.type = dataApplied.type;
      const result = await listDataRequests(params, token);
      setDataData(result.data);
      setDataPaginated(result);
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to load data requests.');
    } finally {
      setDataLoading(false);
    }
  }, [token, dataPage, dataApplied]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const deviceDirty = useMemo(() => JSON.stringify(deviceFilters) !== JSON.stringify(deviceApplied), [deviceFilters, deviceApplied]);
  const dataDirty = useMemo(() => JSON.stringify(dataFilters) !== JSON.stringify(dataApplied), [dataFilters, dataApplied]);

  function applyDeviceFilters() {
    setDevicePage(1);
    setDeviceApplied(deviceFilters);
  }

  function applyDataFilters() {
    setDataPage(1);
    setDataApplied(dataFilters);
  }

  function replaceDeviceRequest(updated: DeviceChangeRequest) {
    setDeviceData((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    setSelectedDevice(updated);
  }

  function replaceDataRequest(updated: DataRequest) {
    setDataData((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    setSelectedData(updated);
  }

  async function handleDeviceReview(req: DeviceChangeRequest, status: Exclude<DeviceChangeRequestStatus, 'pending'>, notes: string) {
    if (!token) return;
    const key = `${req.id}:${status}`;
    setPendingAction(key);
    try {
      const updated = await reviewDeviceChangeRequest(req.id, { status, review_notes: notes || undefined }, token);
      replaceDeviceRequest(updated);
      notify('success', status === 'approved' ? 'Device request approved.' : 'Device request rejected.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to update the request.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDataReview(req: DataRequest, status: Exclude<DataRequestStatus, 'pending'>, notes: string) {
    if (!token) return;
    const key = `${req.id}:${status}`;
    setPendingAction(key);
    try {
      const updated = await reviewDataRequest(req.id, { status, notes: notes || undefined }, token);
      replaceDataRequest(updated);
      notify('success', status === 'completed' ? 'Data request completed.' : 'Data request rejected.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to update the request.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-text">Requests</h1>
        <p className="text-xs text-muted">Review pending requests from employees</p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        <TabButton active={tab === 'device'} onClick={() => setTab('device')} icon={<Smartphone size={15} />}>
          Device requests
          {deviceData?.some((r) => r.status === 'pending') ? (
            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
              {deviceData.filter((r) => r.status === 'pending').length}
            </span>
          ) : null}
        </TabButton>
        <TabButton active={tab === 'data'} onClick={() => setTab('data')} icon={<FileText size={15} />}>
          Data requests
          {dataData?.some((r) => r.status === 'pending') ? (
            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
              {dataData.filter((r) => r.status === 'pending').length}
            </span>
          ) : null}
        </TabButton>
      </div>

      {tab === 'device' && (
        <>
          <Card className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
              <ListFilter size={14} />
              Filters
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Status">
                <Select value={deviceFilters.status} onChange={(e) => setDeviceFilters({ ...deviceFilters, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="">All statuses</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button onClick={applyDeviceFilters} disabled={!deviceDirty} className="w-full">
                  Apply
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            {deviceError ? (
              <ErrorState message={deviceError} onRetry={loadDevice} />
            ) : (
              <>
                <DataTable<DeviceChangeRequest>
                  loading={deviceLoading && !deviceData}
                  rows={deviceData ?? []}
                  keyOf={(r) => r.id}
                  emptyTitle="No device requests found"
                  emptyDescription="Adjust the filters and try again."
                  onRowClick={setSelectedDevice}
                  columns={[
                    {
                      key: 'employee',
                      header: 'Employee',
                      render: (r) => (
                        <div>
                          <div className="font-medium text-text">{r.employee?.full_name ?? '—'}</div>
                          <div className="text-xs text-muted">
                            {r.employee?.employee_id ?? ''}
                            {r.employee?.branch ? ` · ${r.employee.branch}` : ''}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'current_device',
                      header: 'Current device',
                      render: (r) => <span className="font-mono text-xs text-muted">{r.current_device ?? '—'}</span>,
                    },
                    {
                      key: 'new_device_id',
                      header: 'New device',
                      render: (r) => <span className="font-mono text-xs text-text">{r.new_device_id}</span>,
                    },
                    {
                      key: 'reason',
                      header: 'Reason',
                      render: (r) => <span className="line-clamp-2 max-w-[16rem] text-xs text-text">{r.reason ?? '—'}</span>,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (r) => <Badge tone={REQUEST_STATUS_TONES[r.status]} className="capitalize">{r.status}</Badge>,
                    },
                    {
                      key: 'created_at',
                      header: 'Requested at',
                      render: (r) => <span className="font-mono tnum whitespace-nowrap text-xs text-muted">{formatDateTime(r.created_at)}</span>,
                    },
                  ]}
                />
                {devicePaginated && <PaginationBar page={devicePage} paginated={devicePaginated} onPageChange={setDevicePage} />}
              </>
            )}
          </Card>

          <Drawer open={selectedDevice !== null} onClose={() => setSelectedDevice(null)} title="Device change request" wide dark>
            {selectedDevice && (
              <DeviceReview
                request={selectedDevice}
                pendingAction={pendingAction}
                onReview={(status, notes) => handleDeviceReview(selectedDevice, status, notes)}
              />
            )}
          </Drawer>
        </>
      )}

      {tab === 'data' && (
        <>
          <Card className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
              <ListFilter size={14} />
              Filters
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Status">
                <Select value={dataFilters.status} onChange={(e) => setDataFilters({ ...dataFilters, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={dataFilters.type} onChange={(e) => setDataFilters({ ...dataFilters, type: e.target.value })}>
                  <option value="">All types</option>
                  <option value="access">Access</option>
                  <option value="deletion">Deletion</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button onClick={applyDataFilters} disabled={!dataDirty} className="w-full">
                  Apply
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            {dataError ? (
              <ErrorState message={dataError} onRetry={loadData} />
            ) : (
              <>
                <DataTable<DataRequest>
                  loading={dataLoading && !dataData}
                  rows={dataData ?? []}
                  keyOf={(r) => r.id}
                  emptyTitle="No data requests found"
                  emptyDescription="Adjust the filters and try again."
                  onRowClick={setSelectedData}
                  columns={[
                    {
                      key: 'user',
                      header: 'Employee',
                      render: (r) => (
                        <div>
                          <div className="font-medium text-text">{r.user?.name ?? '—'}</div>
                          <div className="text-xs text-muted">{r.user?.employee_id ?? ''}</div>
                        </div>
                      ),
                    },
                    {
                      key: 'type',
                      header: 'Type',
                      render: (r) => <Badge tone={DATA_TYPE_TONES[r.type]} className="capitalize">{r.type}</Badge>,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (r) => <Badge tone={DATA_STATUS_TONES[r.status]} className="capitalize">{r.status}</Badge>,
                    },
                    {
                      key: 'notes',
                      header: 'Notes',
                      render: (r) => <span className="line-clamp-2 max-w-[16rem] text-xs text-text">{r.notes ?? '—'}</span>,
                    },
                    {
                      key: 'created_at',
                      header: 'Requested at',
                      render: (r) => <span className="font-mono tnum whitespace-nowrap text-xs text-muted">{formatDateTime(r.created_at)}</span>,
                    },
                  ]}
                />
                {dataPaginated && <PaginationBar page={dataPage} paginated={dataPaginated} onPageChange={setDataPage} />}
              </>
            )}
          </Card>

          <Drawer open={selectedData !== null} onClose={() => setSelectedData(null)} title="Data request" wide dark>
            {selectedData && (
              <DataReview
                request={selectedData}
                pendingAction={pendingAction}
                onReview={(status, notes) => handleDataReview(selectedData, status, notes)}
              />
            )}
          </Drawer>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors cursor-pointer',
        active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
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

function DeviceReview({
  request,
  pendingAction,
  onReview,
}: {
  request: DeviceChangeRequest;
  pendingAction: string | null;
  onReview: (status: Exclude<DeviceChangeRequestStatus, 'pending'>, notes: string) => void;
}) {
  const [notes, setNotes] = useState(request.review_notes ?? '');
  const busy = pendingAction !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-100">{request.employee?.full_name ?? 'Unknown employee'}</div>
          <div className="font-mono text-xs tnum text-slate-400">{request.employee?.employee_id}</div>
        </div>
        <Badge tone={REQUEST_STATUS_TONES[request.status]} className="capitalize" onDark>{request.status}</Badge>
      </div>

      <div className="divide-y divide-deep-border rounded-lg border border-deep-border bg-deep-2 px-4">
        <DetailRow label="Branch" dark>{request.employee?.branch ?? '—'}</DetailRow>
        <DetailRow label="Current device" dark><span className="font-mono">{request.current_device ?? '—'}</span></DetailRow>
        <DetailRow label="New device" dark><span className="font-mono">{request.new_device_id}</span></DetailRow>
        <DetailRow label="Reason" dark>{request.reason ?? '—'}</DetailRow>
        <DetailRow label="Requested at" dark><span className="font-mono tnum">{formatDateTime(request.created_at)}</span></DetailRow>
      </div>

      {request.status !== 'pending' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <DetailRow label="Status" dark>
            <Badge tone={REQUEST_STATUS_TONES[request.status]} className="capitalize" onDark>{request.status}</Badge>
          </DetailRow>
          {request.review_notes && <DetailRow label="Review notes" dark>{request.review_notes}</DetailRow>}
          {request.reviewed_at && <DetailRow label="Reviewed at" dark><span className="font-mono tnum">{formatDateTime(request.reviewed_at)}</span></DetailRow>}
        </div>
      )}

      {request.status === 'pending' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-slate-400">Review</div>
          <Field label="Review notes (optional)" dark>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note about this review…" dark />
          </Field>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Inbox size={14} />
              Approving registers the new device and deactivates the current one.
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onDark loading={pendingAction === `${request.id}:rejected`} disabled={busy} onClick={() => onReview('rejected', notes)}>
                Reject
              </Button>
              <Button loading={pendingAction === `${request.id}:approved`} disabled={busy} onClick={() => onReview('approved', notes)}>
                Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataReview({
  request,
  pendingAction,
  onReview,
}: {
  request: DataRequest;
  pendingAction: string | null;
  onReview: (status: Exclude<DataRequestStatus, 'pending'>, notes: string) => void;
}) {
  const [notes, setNotes] = useState(request.notes ?? '');
  const busy = pendingAction !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-100">{request.user?.name ?? 'Unknown employee'}</div>
          <div className="font-mono text-xs tnum text-slate-400">{request.user?.employee_id}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={DATA_TYPE_TONES[request.type]} className="capitalize" onDark>{request.type}</Badge>
          <Badge tone={DATA_STATUS_TONES[request.status]} className="capitalize" onDark>{request.status}</Badge>
        </div>
      </div>

      <div className="divide-y divide-deep-border rounded-lg border border-deep-border bg-deep-2 px-4">
        <DetailRow label="Type" dark><span className="capitalize">{request.type === 'access' ? 'Data access' : 'Data deletion'}</span></DetailRow>
        <DetailRow label="Notes" dark>{request.notes ?? '—'}</DetailRow>
        <DetailRow label="Requested at" dark><span className="font-mono tnum">{formatDateTime(request.created_at)}</span></DetailRow>
      </div>

      {request.status !== 'pending' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <DetailRow label="Processed by" dark>{request.processed_by?.name ?? '—'}</DetailRow>
          {request.processed_at && <DetailRow label="Processed at" dark><span className="font-mono tnum">{formatDateTime(request.processed_at)}</span></DetailRow>}
        </div>
      )}

      {request.status === 'pending' && (
        <div className="rounded-lg border border-deep-border bg-deep-2 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-slate-400">Review</div>
          <Field label="Notes (optional)" dark>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note about this review…" dark />
          </Field>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Inbox size={14} />
              Completing fulfills the employee's request; rejecting closes it.
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onDark loading={pendingAction === `${request.id}:rejected`} disabled={busy} onClick={() => onReview('rejected', notes)}>
                Reject
              </Button>
              <Button loading={pendingAction === `${request.id}:completed`} disabled={busy} onClick={() => onReview('completed', notes)}>
                Complete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
