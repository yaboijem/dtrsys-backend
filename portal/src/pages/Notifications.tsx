import { useCallback, useEffect, useState } from 'react';

import { AppNotification, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatDateTime } from '../lib/format';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

export function Notifications() {
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

  useEffect(() => {
    load();
    refreshUnread();
  }, [load, refreshUnread]);

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
    if (window.confirm('Mark all as read?')) {
      markAllRead();
    }
  };

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Screen scroll={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginBottom: spacing.md }}>
        <div style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.ink }}>Alerts</div>
        {unread > 0 ? (
          <button
            onClick={confirmMarkAll}
            aria-label="Mark all as read"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 12,
              ...microLabel,
              color: colors.band,
            }}
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {error ? <Banner kind="error" title="Failed to load alerts" detail={error} /> : null}

      <div style={{ paddingBottom: 24 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: spacing.xl, color: colors.muted }}>
            {loading ? 'Loading…' : 'No alerts yet.'}
          </div>
        ) : (
          items.map((item) => {
            const isUnread = !item.read_at;
            return (
              <button
                key={item.id}
                onClick={() => markRead(item.id)}
                aria-label={item.title ?? 'Notification'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: isUnread ? colors.card : 'transparent',
                  borderColor: isUnread ? colors.border : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: fontSize.md, fontWeight: '700', color: isUnread ? colors.ink : colors.muted }}>
                    {item.title ?? 'Notification'}
                  </div>
                  {item.body ? (
                    <div style={{ fontSize: fontSize.sm, marginTop: 2, lineHeight: 19, color: colors.muted }}>{item.body}</div>
                  ) : null}
                  <div style={{ fontSize: fontSize.sm, marginTop: spacing.xs, color: colors.muted }}>
                    {formatDateTime(item.created_at)}
                  </div>
                </div>
                {isUnread ? (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      marginLeft: spacing.md,
                      backgroundColor: colors.band,
                    }}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </Screen>
  );
}
