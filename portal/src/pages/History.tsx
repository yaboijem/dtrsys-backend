import { useCallback, useEffect, useState } from 'react';

import { Attendance, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { distanceLabel, errorMessage, formatDateTime, minutesToDuration, toLocalDate } from '../lib/format';
import { fontSize, radius, spacing, useThemeColors } from '../theme';

type TypeFilter = '' | 'time_in' | 'time_out';

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'time_in', label: 'Time in' },
  { key: 'time_out', label: 'Time out' },
];

export function History() {
  const colors = useThemeColors();
  const { api, token } = useAuth();

  const [records, setRecords] = useState<Attendance[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>('');
  const [from, setFrom] = useState(toLocalDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(toLocalDate(new Date()));

  const fetchPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!token) {
        return;
      }
      if (replace) {
        setError(null);
      }
      try {
        const res = await api.get<Paginated<Attendance>>(
          '/api/attendance/history',
          { from, to, type: type || undefined, per_page: 20, page: targetPage },
          token,
        );
        setRecords((prev) => (replace ? res.data : [...prev, ...res.data]));
        setPage(res.meta.current_page);
        setLastPage(res.meta.last_page);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api, token, from, to, type],
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = () => {
    if (!loadingMore && page < lastPage) {
      setLoadingMore(true);
      fetchPage(page + 1, false);
    }
  };

  const toneFor = (p: Attendance) => {
    if (p.fraud_flags?.length) {
      return 'danger';
    }
    if ((p.type === 'time_in' && p.is_late) || (p.type === 'time_out' && p.is_early_timeout)) {
      return 'warning';
    }
    return 'neutral';
  };

  return (
    <Screen scroll={false}>
      <div style={{ fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.md, color: colors.ink }}>
        Attendance history
      </div>

      <div style={{ marginBottom: spacing.md }}>
        <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
          {FILTERS.map(({ key, label }) => {
            const active = type === key;
            return (
              <button
                key={key || 'all'}
                style={{
                  flex: 1,
                  minHeight: 44,
                  paddingTop: spacing.sm,
                  paddingBottom: spacing.sm,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.band : colors.card,
                  borderColor: active ? colors.band : colors.border,
                  cursor: 'pointer',
                }}
                onClick={() => setType(key)}
                aria-label={`Filter by ${label}`}
                aria-pressed={active}
              >
                <span style={{ fontSize: fontSize.sm, fontWeight: '700', color: active ? colors.bandText : colors.muted }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: spacing.md }}>
          <div style={{ flex: 1 }}>
            <LabeledInput label="From" value={from} onChangeText={setFrom} type="date" />
          </div>
          <div style={{ flex: 1 }}>
            <LabeledInput label="To" value={to} onChangeText={setTo} type="date" />
          </div>
        </div>
      </div>

      {error ? <Banner kind="error" title="Failed to load history" detail={error} /> : null}

      <div style={{ flex: 1, paddingBottom: 24 }}>
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: spacing.xl, color: colors.muted }}>
            {loading ? 'Loading…' : 'No attendance records match the filters.'}
          </div>
        ) : (
          records.map((item) => (
            <div
              key={item.id}
              style={{
                borderRadius: radius.lg,
                borderWidth: 1,
                borderStyle: 'solid',
                padding: spacing.md,
                marginBottom: spacing.sm,
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
                <Tag label={item.type === 'time_in' ? 'Time in' : 'Time out'} tone={toneFor(item)} />
                {item.is_late ? <Tag label="late" tone="warning" /> : null}
                {item.type === 'time_out' && item.is_early_timeout ? <Tag label="early out" tone="warning" /> : null}
                {item.is_offline ? <Tag label="offline" tone="neutral" /> : null}
                {item.fraud_flags?.map((f) => (
                  <Tag key={f.type} label={f.type} tone="danger" />
                ))}
              </div>
              <div style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>{formatDateTime(item.timestamp)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
                <div style={{ fontSize: fontSize.sm, flex: 1, marginRight: spacing.sm, color: colors.muted }}>
                  {item.branch?.name ?? '—'}
                  {item.gps_location?.distance_from_branch_meters !== null &&
                  item.gps_location?.distance_from_branch_meters !== undefined
                    ? ` · ${distanceLabel(item.gps_location.distance_from_branch_meters)} from branch`
                    : ''}
                  {item.photo?.is_verified === true ? ' · face verified' : ''}
                </div>
                {item.type === 'time_out' && item.work_minutes !== null ? (
                  <div style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.ink }}>
                    {minutesToDuration(item.work_minutes)}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {loadingMore ? (
          <div style={{ textAlign: 'center', paddingTop: spacing.md, paddingBottom: spacing.md, color: colors.muted }}>
            Loading more…
          </div>
        ) : null}
        {page < lastPage && !loadingMore ? (
          <button
            onClick={loadMore}
            style={{
              width: '100%',
              minHeight: 44,
              marginTop: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'solid',
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.ink,
              fontSize: fontSize.md,
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        ) : null}
      </div>
    </Screen>
  );
}
