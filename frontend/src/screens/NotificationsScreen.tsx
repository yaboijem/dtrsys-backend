import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppNotification, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatDateTime } from '../lib/format';
import { useUnread } from '../notifications/UnreadContext';
import { colors, fontSize, spacing } from '../theme';

export function NotificationsScreen() {
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
        <Text style={styles.title}>Notifications</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={confirmMarkAll} hitSlop={8}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Banner kind="error" title="Failed to load notifications" detail={error} /> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading…' : 'No notifications yet.'}</Text>
        }
        renderItem={({ item }) => {
          const isUnread = !item.read_at;
          return (
            <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => markRead(item.id)}>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, isUnread && styles.rowTitleUnread]}>{item.title ?? 'Notification'}</Text>
                {item.body ? <Text style={styles.rowBody}>{item.body}</Text> : null}
                <Text style={styles.rowTime}>{formatDateTime(item.created_at)}</Text>
              </View>
              {isUnread ? <View style={styles.unreadDot} /> : null}
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  markAll: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.muted,
  },
  rowTitleUnread: {
    color: colors.text,
    fontWeight: '800',
  },
  rowBody: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  rowTime: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginLeft: spacing.md,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: spacing.xl,
  },
});
