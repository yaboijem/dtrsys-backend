import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, Shield, Smartphone, Trash2 } from 'lucide-react';

import { AppNotification, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { Banner } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatRelative, startOfDay } from '../lib/format';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, spacing, useThemeColors } from '../theme';

type ConfirmAction =
  | { kind: 'delete-one'; id: string }
  | { kind: 'clear-all' }
  | null;

function notifIcon(title: string | null | undefined, body: string | null | undefined) {
  const t = `${title ?? ''} ${body ?? ''}`.toLowerCase();
  if (t.includes('device')) return Smartphone;
  if (t.includes('schedule') || t.includes('shift')) return CalendarDays;
  if (t.includes('fraud') || t.includes('flag') || t.includes('warning')) return AlertTriangle;
  if (t.includes('mfa') || t.includes('security')) return Shield;
  return Bell;
}

function groupLabel(iso: string): string {
  const d = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(new Date()).getTime();
  const day = 86400000;
  if (d === today) return 'Today';
  if (d === today - day) return 'Yesterday';
  if (d > today - 7 * day) return 'Earlier this week';
  return 'Earlier';
}

export function Notifications() {
  const colors = useThemeColors();
  const { api, token } = useAuth();
  const { refreshUnread, setUnreadCount } = useUnread();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await api.get<Paginated<AppNotification>>('/api/notifications', { per_page: 50 }, token);
      setItems(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    load();
    refreshUnread();
  }, [load, refreshUnread]);

  const markRead = async (id: string) => {
    if (!token) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await api.post<AppNotification>(`/api/notifications/${id}/read`, {}, token);
    } catch {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
      return;
    }
    refreshUnread();
  };

  const markAllRead = async () => {
    if (!token) return;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    try {
      await api.post<{ marked: number }>('/api/notifications/read-all', {}, token);
      setUnreadCount(0);
    } catch {
      load();
    }
  };

  const deleteOne = async (id: string) => {
    if (!token) return;
    const previous = items;
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete<{ deleted: boolean }>(`/api/notifications/${id}`, token);
      refreshUnread();
    } catch {
      setItems(previous);
    }
  };

  const clearAll = async () => {
    if (!token) return;
    const previous = items;
    setItems([]);
    setUnreadCount(0);
    try {
      await api.delete<{ deleted: number }>('/api/notifications', token);
    } catch {
      setItems(previous);
      refreshUnread();
    }
  };

  const unread = items.filter((n) => !n.read_at).length;

  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const item of items) {
      const key = groupLabel(item.created_at);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [items]);

  const headerActionStyle = {
    background: 'none' as const,
    border: 'none' as const,
    cursor: 'pointer' as const,
    minHeight: 44,
    paddingInline: 8,
    fontSize: 12,
    fontWeight: 700,
  };

  return (
    <Screen scroll={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
        <h1 className="portal-page-title">Alerts</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Mark all as read?')) markAllRead();
              }}
              style={{ ...headerActionStyle, color: colors.primary }}
            >
              Mark all read
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'clear-all' })}
              style={{ ...headerActionStyle, color: colors.dangerText }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>

      {error ? <Banner kind="error" title="Failed to load alerts" detail={error} /> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        {items.length === 0 ? (
          <div className="portal-card portal-card-pad" style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                margin: '0 auto 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                color: colors.primary,
              }}
            >
              <Bell size={22} />
            </div>
            <div style={{ fontWeight: 700, color: colors.ink }}>{loading ? 'Loading…' : 'No alerts yet'}</div>
            <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {loading ? 'Fetching your notifications.' : 'System messages will show up here.'}
            </div>
          </div>
        ) : (
          groups.map(([label, list]) => (
            <section key={label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: colors.muted,
                  marginBottom: 8,
                  paddingLeft: 2,
                }}
              >
                {label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map((item) => {
                  const isUnread = !item.read_at;
                  const Icon = notifIcon(item.title, item.body);
                  return (
                    <div key={item.id} className={`notif-card${isUnread ? ' is-unread' : ''}`} style={{ display: 'flex', gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => markRead(item.id)}
                        aria-label={item.title ?? 'Notification'}
                        style={{
                          display: 'flex',
                          flex: 1,
                          minWidth: 0,
                          gap: 12,
                          alignItems: 'flex-start',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                          font: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isUnread
                              ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                              : 'color-mix(in srgb, var(--muted) 12%, transparent)',
                            color: isUnread ? colors.primary : colors.muted,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: fontSize.md,
                              fontWeight: isUnread ? 800 : 600,
                              color: isUnread ? colors.ink : colors.muted,
                              lineHeight: 1.3,
                            }}
                          >
                            {item.title ?? 'Notification'}
                          </div>
                          {item.body ? (
                            <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.4, color: colors.muted }}>{item.body}</div>
                          ) : null}
                          <div className="tnum" style={{ fontSize: 11, marginTop: 6, color: colors.muted, fontWeight: 600 }}>
                            {formatRelative(item.created_at)}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete alert"
                        onClick={() => setConfirm({ kind: 'delete-one', id: item.id })}
                        style={{
                          flexShrink: 0,
                          alignSelf: 'center',
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          border: 'none',
                          background: 'color-mix(in srgb, var(--danger, #ef4444) 10%, transparent)',
                          color: colors.dangerText,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.kind === 'clear-all' ? 'Clear all alerts?' : 'Delete alert?'}
        message={
          confirm?.kind === 'clear-all'
            ? 'This will permanently remove every alert. This cannot be undone.'
            : 'This alert will be permanently removed. This cannot be undone.'
        }
        confirmLabel={confirm?.kind === 'clear-all' ? 'Clear all' : 'Delete'}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action?.kind === 'clear-all') clearAll();
          else if (action?.kind === 'delete-one') deleteOne(action.id);
        }}
      />
    </Screen>
  );
}
