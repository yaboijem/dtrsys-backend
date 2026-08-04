import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarClock, Clock4, Flag, LogOut, UserX } from 'lucide-react';
import { ApiError } from '../api/client';
import { dashboardSummary, listAuditLogs } from '../api/endpoints';
import type { AuditLog, DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Avatar, Card, ErrorState, MetricCard, Spinner } from '../components/ui';
import { activityDef } from '../lib/activities';
import { deltaLabel, formatDate, formatRelative } from '../lib/format';

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

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error || !summary) return <ErrorState message={error ?? 'No data available.'} onRetry={load} />;

  const sev = summary.open_fraud_by_severity ?? { high: 0, medium: 0, low: 0 };

  return (
    <div>
      <PageHeader title="Dashboard" description={`Today · ${formatDate(summary.date)}`} />

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
          <MetricCard
            label="Late arrivals"
            value={summary.late_ins_today}
            icon={<Clock4 size={18} />}
            tone="warning"
            delta={deltaLabel(summary.late_ins_today, summary.late_ins_yesterday ?? 0)}
            onClick={() => navigate('/attendance?is_late=1')}
          />
          <MetricCard
            label="Early time outs"
            value={summary.early_time_outs_today}
            icon={<LogOut size={18} />}
            tone="warning"
            delta={deltaLabel(summary.early_time_outs_today, summary.early_time_outs_yesterday ?? 0)}
            onClick={() => navigate('/attendance?is_early_timeout=1')}
          />
          <MetricCard
            label="Absent today"
            value={summary.absent_today}
            icon={<UserX size={18} />}
            delta={deltaLabel(summary.absent_today, summary.absent_yesterday ?? 0)}
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
          <Card className="p-4 shadow-sm">
            <div className="mb-2 text-xs font-medium text-muted">Open by severity</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'high', label: 'High', n: sev.high, className: 'bg-red-50 text-red-800 border-red-200' },
                  { key: 'medium', label: 'Medium', n: sev.medium, className: 'bg-amber-50 text-amber-900 border-amber-200' },
                  { key: 'low', label: 'Low', n: sev.low, className: 'bg-slate-50 text-slate-700 border-slate-200' },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate(`/fraud-flags?status=open&severity=${s.key}`)}
                  className={`rounded-lg border px-2 py-2.5 text-center cursor-pointer transition hover:shadow-sm ${s.className}`}
                >
                  <div className="font-mono text-lg font-bold tnum">{s.n}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{s.label}</div>
                </button>
              ))}
            </div>
          </Card>
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
    </div>
  );
}
