import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { listHomeLocations, reviewHomeLocation } from '../api/endpoints';
import type { HomeLocation, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { LocationMap } from '../components/LocationMap';
import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea } from '../components/ui';
import { DataTable, DEFAULT_PAGE_SIZE, PaginationBar } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { useToast } from '../components/Toast';
import { formatDateTime, formatHomeAddress } from '../lib/format';

export function HomeLocationsPage() {
  const { token } = useAuth();
  const { notify } = useToast();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<HomeLocation[] | null>(null);
  const [paginated, setPaginated] = useState<Paginated<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HomeLocation | null>(null);
  const [note, setNote] = useState('');
  const [radius, setRadius] = useState('150');
  const [linkId, setLinkId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listHomeLocations({ page, per_page: perPage, status: status || undefined }, token);
      setData(result.data);
      setPaginated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load home locations.');
    } finally {
      setLoading(false);
    }
  }, [token, page, perPage, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const employeeLabel = useMemo(() => {
    if (!selected?.employees?.length) return '—';
    return selected.employees.map((e) => e.full_name).join(', ');
  }, [selected]);

  async function act(action: 'approve' | 'reject' | 'link') {
    if (!token || !selected) return;
    setBusy(action);
    try {
      const body: Parameters<typeof reviewHomeLocation>[1] = {
        action,
        review_note: note || undefined,
      };
      if (action === 'approve' && radius) {
        body.radius_meters = Number(radius);
      }
      if (action === 'link') {
        body.link_home_location_id = Number(linkId);
        body.employee_id = selected.employees?.[0]?.id;
      }
      await reviewHomeLocation(selected.id, body, token);
      notify('success', `Home location ${action}d.`);
      setSelected(null);
      setNote('');
      setLinkId('');
      void load();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Review failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Home locations"
        description="Approve WFH employee home pins (self-registered)"
      />

      <Card className="mb-4 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="retired">Retired</option>
            <option value="">All</option>
          </Select>
        </div>
      </Card>

      <Card className="shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <DataTable<HomeLocation>
              loading={loading && !data}
              rows={data ?? []}
              keyOf={(r) => r.id}
              emptyTitle="No home locations"
              emptyDescription="WFH employees submit pins from the portal."
              onRowClick={(r) => {
                setSelected(r);
                setRadius(String(r.radius_meters ?? 150));
                setNote('');
                setLinkId('');
              }}
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => (
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text">
                        {r.employees?.map((e) => e.full_name).join(', ') || '—'}
                      </div>
                      <div className="truncate text-xs text-muted">{r.label || `Home #${r.id}`}</div>
                    </div>
                  ),
                },
                {
                  key: 'location',
                  header: 'Location',
                  render: (r) => (
                    <span className="text-sm text-text">{formatHomeAddress(r)}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (
                    <Badge tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : 'gray'}>
                      {r.status}
                    </Badge>
                  ),
                },
                {
                  key: 'submitted',
                  header: 'Submitted',
                  render: (r) => (
                    <span className="font-mono text-xs tnum text-muted">{formatDateTime(r.created_at)}</span>
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

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Review home location">
        {selected && (
          <div className="space-y-4 p-4">
            <div>
              <div className="text-xs font-semibold text-muted">Employee</div>
              <div className="text-sm font-medium text-text">{employeeLabel}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">Location</div>
              <div className="text-sm text-text">{formatHomeAddress(selected)}</div>
            </div>
            <LocationMap
              latitude={Number(selected.latitude)}
              longitude={Number(selected.longitude)}
              label="Home"
              radiusMeters={
                selected.status === 'pending'
                  ? (radius.trim() === '' || Number.isNaN(Number(radius)) ? selected.radius_meters : Number(radius))
                  : selected.radius_meters
              }
              className="h-56"
            />
            {selected.status === 'pending' && (
              <>
                <Field label="Radius (meters)">
                  <Input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" min={50} />
                </Field>
                <Field label="Note (optional)">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy === 'approve'} onClick={() => void act('approve')}>
                    Approve
                  </Button>
                  <Button variant="secondary" loading={busy === 'reject'} onClick={() => void act('reject')}>
                    Reject
                  </Button>
                </div>
                <div className="border-t border-border pt-4">
                  <Field label="Or link to existing approved home ID">
                    <Input value={linkId} onChange={(e) => setLinkId(e.target.value)} placeholder="Home location id" />
                  </Field>
                  <Button
                    className="mt-2"
                    variant="secondary"
                    disabled={!linkId || !selected.employees?.[0]?.id}
                    loading={busy === 'link'}
                    onClick={() => void act('link')}
                  >
                    Link shared pin
                  </Button>
                </div>
              </>
            )}
            {selected.status !== 'pending' && (
              <div className="text-sm text-muted">
                Status: <strong>{selected.status}</strong>
                {selected.review_note ? ` — ${selected.review_note}` : ''}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
