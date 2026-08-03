import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Flag, Timer, UserX, Clock4, Activity } from 'lucide-react';
import { ApiError } from '../api/client';
import { dashboardSummary, listAuditLogs } from '../api/endpoints';
import type { AuditLog, DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Card, ErrorState, Spinner } from '../components/ui';
import { activityDef } from '../lib/activities';
import { formatDate, formatDateTime } from '../lib/format';

interface StatDef {
  key: keyof DashboardSummary;
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}

export function DashboardPage() {
  const { token, hasRole } = useAuth();
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
      const result = await listAuditLogs({ per_page: 10 }, token);
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

  if (loading) {
    return <Spinner label="Loading dashboard…" />;
  }

  if (error || !summary) {
    return <ErrorState message={error ?? 'No data available.'} onRetry={load} />;
  }

  const stats: StatDef[] = [
    { key: 'time_ins_today', label: 'Time-ins today', value: summary.time_ins_today, icon: <CalendarClock size={18} />, tone: 'bg-cyan-50 text-primary' },
    { key: 'late_ins_today', label: 'Late arrivals', value: summary.late_ins_today, icon: <Clock4 size={18} />, tone: 'bg-amber-50 text-warning' },
    { key: 'absent_today', label: 'Absent today', value: summary.absent_today, icon: <UserX size={18} />, tone: 'bg-slate-100 text-muted' },
    { key: 'open_fraud_flags', label: 'Open fraud flags', value: summary.open_fraud_flags, icon: <Flag size={18} />, tone: 'bg-red-50 text-danger' },
    { key: 'pending_device_change_requests', label: 'Pending device requests', value: summary.pending_device_change_requests, icon: <Timer size={18} />, tone: 'bg-violet-50 text-violet-700' },
  ];

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Dashboard</h1>
          <p className="font-mono text-xs tnum text-muted">{formatDate(summary.date)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.key} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-2xl font-bold tnum text-text">{stat.value}</div>
                <div className="mt-0.5 text-xs text-muted">{stat.label}</div>
              </div>
              <div className={`rounded-md p-2 ${stat.tone}`}>{stat.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Activity size={15} className="text-primary" />
          <h2 className="text-sm font-semibold text-text">Recent activities</h2>
        </div>
        {!canViewActivities ? (
          <p className="px-4 py-6 text-center text-xs text-muted">Audit trail access is limited to Super Admin and HR.</p>
        ) : activitiesFailed ? (
          <p className="px-4 py-6 text-center text-xs text-muted">Couldn't load recent activity.</p>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center">
            <span className="text-sm font-medium text-text">No recent activity</span>
            <span className="text-xs text-muted">Actions across the system will show up here.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((log) => {
              const def = activityDef(log.action);
              return (
                <li key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${def.tone}`}>{def.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text">
                      <span className="font-medium">{log.actor?.name ?? 'System'}</span>{' '}
                      <span className="text-muted">{def.label}</span>
                    </div>
                    <div className="text-xs text-muted">{log.action}</div>
                  </div>
                  <div className="shrink-0 font-mono tnum text-xs text-muted">{formatDateTime(log.created_at)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
