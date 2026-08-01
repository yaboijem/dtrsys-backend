import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ApiError } from '../api/client';
import { Attendance, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { distanceLabel, errorMessage, formatDateTime, minutesToDuration, toLocalDate } from '../lib/format';
import { colors, fontSize, spacing } from '../theme';

type TypeFilter = '' | 'time_in' | 'time_out';

export function HistoryScreen() {
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
      <Text style={styles.title}>Attendance history</Text>

      <View style={styles.filters}>
        <View style={styles.typeRow}>
          {(['', 'time_in', 'time_out'] as TypeFilter[]).map((t) => (
            <TouchableOpacity
              key={t || 'all'}
              style={[styles.typeButton, type === t && styles.typeButtonActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeLabel, type === t && styles.typeLabelActive]}>
                {t === '' ? 'All' : t === 'time_in' ? 'Time in' : 'Time out'}
              </Text>
            </TouchableOpacity>
          ))}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading…' : 'No attendance records match the filters.'}</Text>
        }
        ListFooterComponent={loadingMore ? <Text style={styles.footer}>Loading more…</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Tag label={item.type === 'time_in' ? 'Time in' : 'Time out'} tone={toneFor(item)} />
              {item.is_late ? <Tag label="late" tone="warning" /> : null}
              {item.is_offline ? <Tag label="offline" tone="neutral" /> : null}
              {item.fraud_flags?.map((f) => (
                <Tag key={f.type} label={f.type} tone="danger" />
              ))}
            </View>
            <Text style={styles.timestamp}>{formatDateTime(item.timestamp)}</Text>
            <View style={styles.rowBottom}>
              <Text style={styles.meta}>
                {item.branch?.name ?? '—'}
                {item.gps_location?.distance_from_branch_meters !== null &&
                item.gps_location?.distance_from_branch_meters !== undefined
                  ? ` · ${distanceLabel(item.gps_location.distance_from_branch_meters)} from branch`
                  : ''}
                {item.photo?.is_verified === true ? ' · face verified' : ''}
              </Text>
              {item.type === 'time_out' && item.work_minutes !== null ? (
                <Text style={styles.duration}>{minutesToDuration(item.work_minutes)}</Text>
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
    color: colors.text,
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
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.muted,
  },
  typeLabelActive: {
    color: colors.white,
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
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  timestamp: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.muted,
    flex: 1,
    marginRight: spacing.sm,
  },
  duration: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: spacing.xl,
  },
  footer: {
    textAlign: 'center',
    color: colors.muted,
    paddingVertical: spacing.md,
  },
});
