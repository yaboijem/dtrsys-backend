import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppNotification, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatDateTime } from '../lib/format';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

export function NotificationsScreen() {
  const colors = useThemeColors();
  const { api, token } = useAuth();
  const { refreshUnread, setUnreadCount } = useUnread();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const res = await api.get<Paginated<AppNotification>>(
        '/api/notifications',
        { per_page: 50 },
        token,
      );
      setItems(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, token]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUnread();
    }, [load, refreshUnread]),
  );

  const markRead = async (id: string) => {
    if (!token) {
      return;
    }
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await api.post<AppNotification>(`/api/notifications/${id}/read`, {}, token);
    } catch {
      // revert optimistic update on failure
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
      return;
    }
    refreshUnread();
  };

  const markAllRead = async () => {
    if (!token) {
      return;
    }
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    try {
      const res = await api.post<{ marked: number }>('/api/notifications/read-all', {}, token);
      setUnreadCount(0);
      void res;
    } catch {
      load();
    }
  };

  const confirmMarkAll = () => {
    Alert.alert('Mark all as read?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark all', onPress: markAllRead },
    ]);
  };

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.ink }]}>Alerts</Text>
        {unread > 0 ? (
          <TouchableOpacity
            onPress={confirmMarkAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            hitSlop={12}
          >
            <Text style={[microLabel, { color: colors.band }]}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Banner kind="error" title="Failed to load alerts" detail={error} /> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.muted} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            {loading ? 'Loading…' : 'No alerts yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const isUnread = !item.read_at;
          return (
            <TouchableOpacity
              style={[
                styles.row,
                {
                  backgroundColor: isUnread ? colors.card : 'transparent',
                  borderColor: isUnread ? colors.border : 'transparent',
                },
              ]}
              activeOpacity={0.7}
              onPress={() => markRead(item.id)}
              accessibilityRole="button"
              accessibilityLabel={item.title ?? 'Notification'}
            >
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, { color: isUnread ? colors.ink : colors.muted }]}>
                  {item.title ?? 'Notification'}
                </Text>
                {item.body ? <Text style={[styles.rowBody, { color: colors.muted }]}>{item.body}</Text> : null}
                <Text style={[styles.rowTime, { color: colors.muted }]}>{formatDateTime(item.created_at)}</Text>
              </View>
              {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.band }]} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rowBody: {
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 19,
  },
  rowTime: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: spacing.md,
  },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
