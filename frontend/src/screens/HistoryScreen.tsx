import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ApiError } from '../api/client';
import { Attendance, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { distanceLabel, errorMessage, formatDateTime, minutesToDuration, toLocalDate } from '../lib/format';
import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

type TypeFilter = '' | 'time_in' | 'time_out';

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'time_in', label: 'Time in' },
  { key: 'time_out', label: 'Time out' },
];

export function HistoryScreen() {
  const colors = useThemeColors();
  const { api, token } = useAuth();

  const [records, setRecords] = useState<Attendance[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [api, token, from, to, type],
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(1, true);
  }, [fetchPage]);

  const refresh = () => {
    setRefreshing(true);
    fetchPage(1, true);
  };

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
    if (p.type === 'time_in' && p.is_late) {
      return 'warning';
    }
    return 'neutral';
  };

  return (
    <Screen scroll={false}>
      <Text style={[styles.title, { color: colors.ink }]}>Attendance history</Text>

      <View style={styles.filters}>
        <View style={styles.typeRow}>
          {FILTERS.map(({ key, label }) => {
            const active = type === key;
            return (
              <TouchableOpacity
                key={key || 'all'}
                style={[
                  styles.typeButton,
                  { backgroundColor: active ? colors.band : colors.card, borderColor: active ? colors.band : colors.border },
                ]}
                onPress={() => setType(key)}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.typeLabel, { color: active ? colors.bandText : colors.muted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <LabeledInput label="From" value={from} onChangeText={setFrom} autoCapitalize="none" placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.dateField}>
            <LabeledInput label="To" value={to} onChangeText={setTo} autoCapitalize="none" placeholder="YYYY-MM-DD" />
          </View>
        </View>
      </View>

      {error ? <Banner kind="error" title="Failed to load history" detail={error} /> : null}

      <FlatList
        style={styles.listFlex}
        data={records}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            {loading ? 'Loading…' : 'No attendance records match the filters.'}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? <Text style={[styles.footer, { color: colors.muted }]}>Loading more…</Text> : null
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <Tag label={item.type === 'time_in' ? 'Time in' : 'Time out'} tone={toneFor(item)} />
              {item.is_late ? <Tag label="late" tone="warning" /> : null}
              {item.is_offline ? <Tag label="offline" tone="neutral" /> : null}
              {item.fraud_flags?.map((f) => (
                <Tag key={f.type} label={f.type} tone="danger" />
              ))}
            </View>
            <Text style={[styles.timestamp, { color: colors.ink }]}>{formatDateTime(item.timestamp)}</Text>
            <View style={styles.rowBottom}>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {item.branch?.name ?? '—'}
                {item.gps_location?.distance_from_branch_meters !== null &&
                item.gps_location?.distance_from_branch_meters !== undefined
                  ? ` · ${distanceLabel(item.gps_location.distance_from_branch_meters)} from branch`
                  : ''}
                {item.photo?.is_verified === true ? ' · face verified' : ''}
              </Text>
              {item.type === 'time_out' && item.work_minutes !== null ? (
                <Text style={[styles.duration, { color: colors.ink }]}>{minutesToDuration(item.work_minutes)}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  filters: {
    marginBottom: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: {
    flex: 1,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  timestamp: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  meta: {
    fontSize: fontSize.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  duration: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  footer: {
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
