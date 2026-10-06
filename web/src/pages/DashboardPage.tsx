import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarClock, Coffee, Flag, Users } from 'lucide-react';
import { ApiError } from '../api/client';
import { dashboardSummary, listAuditLogs } from '../api/endpoints';
import type { AuditLog, DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Avatar, Card, ErrorState, MetricCard, Spinner } from '../components/ui';
import { activityDef } from '../lib/activities';
import { deltaLabel, formatDate, formatRelative } from '../lib/format';

const BREAK_KIND_ORDER = ['15_min', '5_min', 'lunch_60', 'bio', 'phone', 'coaching', 'huddle', 'training', 'unspecified'];

const BREAK_KIND_LABELS: Record<string, string> = {
  '15_min': '15 mins break',
  '5_min': '5 mins break (test)',
  lunch_60: '1hr Lunch Break',
  bio: 'Bio break',
  phone: 'Phone time',
  coaching: 'Coaching',
  huddle: 'Huddle',
  training: 'Training',
  unspecified: 'Unspecified',
};

function breakBreakdown(counts: Record<string, number> | undefined) {
  const byKind = counts ?? {};
  const known = BREAK_KIND_ORDER.filter((kind) => (byKind[kind] ?? 0) > 0);
  const extra = Object.keys(byKind).filter((kind) => !BREAK_KIND_ORDER.includes(kind) && (byKind[kind] ?? 0) > 0);

  return [...known, ...extra].map((kind) => ({
    kind,
    label: BREAK_KIND_LABELS[kind] ?? kind,
    n: byKind[kind] ?? 0,
  }));
}

export function DashboardPage() {
  const { token, hasRole } = useAuth();
  const navigate = useNavigate();
  const canViewActivities = hasRole('Super Admin', 'HR');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [activitiesFailed, setActivitiesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await dashboardSummary(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadActivities = useCallback(async () => {
    if (!token || !canViewActivities) return;
    try {
      const result = await listAuditLogs({ per_page: 12 }, token);
      setActivities(result.data);
    } catch {
      setActivitiesFailed(true);
    }
  }, [token, canViewActivities]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  if (error || (!loading && !summary)) return <ErrorState message={error ?? 'No data available.'} onRetry={load} />;

  const breaks = summary ? breakBreakdown(summary.on_break_by_kind) : [];

  return (
    <div>
      <PageHeader title="Dashboard" description={summary ? `Today · ${formatDate(summary.date)}` : 'Today'} />
      {loading || !summary ? <Spinner label="Loading dashboard…" /> : null}
      {summary ? (
      <>
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Attendance</h2>
        <div className="metric-grid">
          <MetricCard
            label="Time-ins today"
            value={summary.time_ins_today}
            icon={<CalendarClock size={18} />}
            delta={deltaLabel(summary.time_ins_today, summary.time_ins_yesterday ?? 0)}
            onClick={() => navigate('/attendance')}
          />
          <Card className="p-4 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-2xl font-bold tracking-tight tnum text-text">{summary.on_break ?? 0}</div>
                <div className="mt-1 text-xs font-medium text-muted">On break</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-2 text-warning">
                <Coffee size={18} />
              </div>
            </div>
            {breaks.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {breaks.map((item) => (
                  <li
                    key={item.kind}
                    className="rounded-md border border-border bg-slate-50 px-2 py-1 text-[11px] font-medium text-text"
                  >
                    <span className="font-mono font-bold tnum">{item.n}</span>
                    <span className="ml-1 text-muted">{item.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] font-medium text-muted">No one on break</p>
            )}
          </Card>
          <MetricCard
            label="Employees"
            value={summary.employees_total ?? 0}
            icon={<Users size={18} />}
            onClick={hasRole('Super Admin', 'HR') ? () => navigate('/employees') : undefined}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Security & alerts</h2>
        <div className="metric-grid--security">
          <MetricCard
            label="Open fraud flags"
            value={summary.open_fraud_flags}
            icon={<Flag size={18} />}
            tone="danger"
            onClick={() => navigate('/fraud-flags?status=open')}
          />
        </div>
      </section>

      <Card className="shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3.5 sm:px-5">
          <Activity size={15} className="text-primary" />
          <h2 className="text-sm font-semibold text-text">Recent activity</h2>
        </div>
        {!canViewActivities ? (
          <p className="px-4 py-6 text-center text-xs text-muted sm:px-5">
            Audit trail access is limited to Super Admin and HR.
          </p>
        ) : activitiesFailed ? (
          <p className="px-4 py-6 text-center text-xs text-muted sm:px-5">Couldn't load recent activity.</p>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center">
            <span className="text-sm font-medium text-text">No recent activity</span>
            <span className="text-xs text-muted">Actions across the system will show up here.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((log) => {
              const def = activityDef(log.action);
              const actor = log.actor?.name ?? 'System';
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <Avatar name={actor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text">
                      <span className="font-semibold">{actor}</span>{' '}
                      <span className="text-muted">{def.label}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] tnum text-muted/80">{log.action}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-medium text-muted">{formatRelative(log.created_at)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </>
      ) : null}
    </div>
  );
}
