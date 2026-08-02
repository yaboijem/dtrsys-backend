import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Flag, Timer, UserX, Clock4 } from 'lucide-react';
import { ApiError } from '../api/client';
import { dashboardSummary } from '../api/endpoints';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Card, ErrorState, Spinner } from '../components/ui';
import { formatDate } from '../lib/format';

interface StatDef {
  key: keyof DashboardSummary;
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}

export function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
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

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Spinner label="Loading dashboard…" />;
  }

  if (error || !summary) {
    return <ErrorState message={error ?? 'No data available.'} onRetry={load} />;
  }

  const stats: StatDef[] = [
    { key: 'time_ins_today', label: 'Time-ins today', value: summary.time_ins_today, icon: <CalendarClock size={18} />, tone: 'bg-blue-50 text-primary' },
    { key: 'late_ins_today', label: 'Late arrivals', value: summary.late_ins_today, icon: <Clock4 size={18} />, tone: 'bg-amber-50 text-warning' },
    { key: 'absent_today', label: 'Absent today', value: summary.absent_today, icon: <UserX size={18} />, tone: 'bg-slate-100 text-muted' },
    { key: 'open_fraud_flags', label: 'Open fraud flags', value: summary.open_fraud_flags, icon: <Flag size={18} />, tone: 'bg-red-50 text-danger' },
    { key: 'pending_device_change_requests', label: 'Pending device requests', value: summary.pending_device_change_requests, icon: <Timer size={18} />, tone: 'bg-violet-50 text-violet-700' },
  ];

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Dashboard</h1>
          <p className="text-xs text-muted">{formatDate(summary.date)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.key} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold text-text">{stat.value}</div>
                <div className="mt-0.5 text-xs text-muted">{stat.label}</div>
              </div>
              <div className={`rounded-md p-2 ${stat.tone}`}>{stat.icon}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
