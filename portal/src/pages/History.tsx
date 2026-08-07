import { useCallback, useEffect, useState } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';

import { Attendance, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, Tag } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { loadHistoryCache, saveHistoryCache } from '../lib/dataCache';
import { distanceLabel, errorMessage, formatDateTime, minutesToDuration, toLocalDate } from '../lib/format';
import { fontSize, spacing, useThemeColors } from '../theme';

type TypeFilter = '' | 'time_in' | 'time_out' | 'break_in' | 'break_out';

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'time_in', label: 'In' },
  { key: 'time_out', label: 'Out' },
];

type RangePreset = 'week' | 'month' | 'custom';

function daysAgo(n: number): string {
  return toLocalDate(new Date(Date.now() - n * 86400000));
}

export function History() {
  const colors = useThemeColors();
  const { api, token, user } = useAuth();
  const userKey = user?.employee_id ?? (user?.id != null ? String(user.id) : null);

  const [records, setRecords] = useState<Attendance[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [type, setType] = useState<TypeFilter>('');
  const [preset, setPreset] = useState<RangePreset>('week');
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(toLocalDate(new Date()));
  const [rangeOpen, setRangeOpen] = useState(false);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p === 'week') {
      setFrom(daysAgo(6));
      setTo(toLocalDate(new Date()));
    } else if (p === 'month') {
      setFrom(daysAgo(29));
      setTo(toLocalDate(new Date()));
    }
  };

  const fetchPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!token) return;
      if (replace) setError(null);
      try {
        const res = await api.get<Paginated<Attendance>>(
          '/api/attendance/history',
          { from, to, type: type || undefined, per_page: 20, page: targetPage },
          token,
        );
        setRecords((prev) => {
          const merged = replace ? res.data : [...prev, ...res.data];
          if (userKey) {
            void saveHistoryCache(userKey, {
              records: merged,
              from,
              to,
              type,
              page: res.meta.current_page,
              lastPage: res.meta.last_page,
            });
          }
          return merged;
        });
        setPage(res.meta.current_page);
        setLastPage(res.meta.last_page);
        setStale(false);
      } catch (err) {
        if (replace && userKey) {
          const cached = await loadHistoryCache(userKey);
          if (cached && cached.records.length > 0) {
            setRecords(cached.records);
            setPage(cached.page);
            setLastPage(cached.lastPage);
            setStale(true);
            setError(null);
            return;
          }
        }
        setError(errorMessage(err));
        setStale(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api, token, from, to, type, userKey],
  );

  useEffect(() => {
    setLoading(true);
    setStale(false);
    fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = () => {
    if (!loadingMore && page < lastPage) {
      setLoadingMore(true);
      fetchPage(page + 1, false);
    }
  };

  const toneFor = (p: Attendance) => {
    if (p.fraud_flags?.length) return 'danger' as const;
    if ((p.type === 'time_in' && p.is_late) || (p.type === 'time_out' && p.is_early_timeout)) return 'warning' as const;
    return 'neutral' as const;
  };

  return (
    <Screen scroll={false}>
      <h1 className="portal-page-title">History</h1>

      <div className="segmented" role="tablist" aria-label="Punch type">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key || 'all'}
            type="button"
            role="tab"
            aria-selected={type === key}
            className={`segmented__btn${type === key ? ' is-active' : ''}`}
            onClick={() => setType(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="portal-card portal-card-pad">
        <button
          type="button"
          onClick={() => setRangeOpen((o) => !o)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: colors.ink,
            fontWeight: 700,
            fontSize: fontSize.sm,
          }}
        >
          <span>Date range</span>
          <span className="tnum" style={{ color: colors.muted, fontWeight: 600 }}>
            {from} → {to}
          </span>
        </button>
        {rangeOpen ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  { id: 'week' as const, label: 'This week' },
                  { id: 'month' as const, label: 'This month' },
                  { id: 'custom' as const, label: 'Custom' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  style={{
                    flex: 1,
                    minHeight: 36,
                    borderRadius: 10,
                    border: `1px solid ${preset === p.id ? colors.primary : colors.border}`,
                    background: preset === p.id ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : colors.card,
                    color: preset === p.id ? colors.primary : colors.muted,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset('custom');
                    setFrom(e.target.value);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 4,
                    minHeight: 40,
                    borderRadius: 10,
                    border: `1px solid ${colors.border}`,
                    padding: '8px 10px',
                    background: colors.card,
                    color: colors.ink,
                  }}
                />
              </label>
              <label style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset('custom');
                    setTo(e.target.value);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 4,
                    minHeight: 40,
                    borderRadius: 10,
                    border: `1px solid ${colors.border}`,
                    padding: '8px 10px',
                    background: colors.card,
                    color: colors.ink,
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {stale ? (
        <Banner
          kind="info"
          title="Showing saved history"
          detail="Connect to the internet to load the latest history."
        />
      ) : null}
      {error ? <Banner kind="error" title="Failed to load history" detail={error} /> : null}

      <div style={{ flex: 1, paddingBottom: 8 }}>
        {records.length === 0 ? (
          <div className="portal-card portal-card-pad" style={{ textAlign: 'center', color: colors.muted }}>
            {loading ? 'Loading…' : 'No attendance records match the filters.'}
          </div>
        ) : (
          <div className="timeline">
            {records.map((item) => (
              <div key={item.id} className="timeline__item">
                <div className="timeline__rail">
                  <span
                    className="timeline__dot"
                    style={{
                      background:
                        item.type === 'time_in' ? 'var(--success)' : item.fraud_flags?.length ? 'var(--danger)' : 'var(--primary)',
                    }}
                  />
                </div>
                <div className="portal-card portal-card-pad">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <Tag
                      label={
                        item.type === 'time_in'
                          ? 'Time in'
                          : item.type === 'time_out'
                            ? 'Time out'
                            : item.type === 'break_in'
                              ? 'Break in'
                              : 'Break out'
                      }
                      tone={item.type.startsWith('break') ? 'neutral' : toneFor(item)}
                    />
                    {item.is_late ? <Tag label="Late" tone="warning" /> : null}
                    {item.type === 'time_out' && item.is_early_timeout ? <Tag label="Early out" tone="warning" /> : null}
                    {item.is_overbreak ? <Tag label="Overbreak" tone="danger" /> : null}
                    {item.is_offline ? <Tag label="Offline" tone="neutral" /> : null}
                    {item.fraud_flags?.map((f) => (
                      <Tag key={f.type} label={f.type} tone="danger" />
                    ))}
                  </div>
                  <div className="tnum" style={{ fontSize: 18, fontWeight: 800, color: colors.ink, letterSpacing: '-0.02em' }}>
                    {formatDateTime(item.timestamp)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginTop: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 600, color: colors.ink }}>{item.branch?.name ?? '—'}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' }}>
                        {item.gps_location?.distance_from_branch_meters != null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} />
                            {distanceLabel(item.gps_location.distance_from_branch_meters)} from branch
                          </span>
                        ) : null}
                        {item.photo?.is_verified === true ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.successText }}>
                            <ShieldCheck size={12} />
                            Face verified
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {item.type === 'time_out' && item.work_minutes !== null ? (
                      <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: colors.ink, flexShrink: 0 }}>
                        {minutesToDuration(item.work_minutes)}
                      </div>
                    ) : null}
                    {item.type === 'break_out' && item.break_minutes != null ? (
                      <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: colors.ink, flexShrink: 0 }}>
                        {item.break_minutes}m
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loadingMore ? (
          <div style={{ textAlign: 'center', padding: spacing.md, color: colors.muted }}>Loading more…</div>
        ) : null}
        {page < lastPage && !loadingMore ? (
          <button
            type="button"
            onClick={loadMore}
            className="portal-card"
            style={{
              width: '100%',
              minHeight: 44,
              marginTop: 4,
              fontWeight: 700,
              color: colors.ink,
              cursor: 'pointer',
              background: colors.card,
            }}
          >
            Load more
          </button>
        ) : null}
      </div>
    </Screen>
  );
}
