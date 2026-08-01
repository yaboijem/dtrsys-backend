import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthContext';

interface UnreadContextValue {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

const UnreadContext = createContext<UnreadContextValue | null>(null);

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { api, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const result = await api.get<{ count: number }>('/api/notifications/unread-count', undefined, token);
      setUnreadCount(result.count);
    } catch {
      // ignore refresh failures; badge will update on next visit
    }
  }, [api, token]);

  useEffect(() => {
    refreshUnread();
  }, [token, refreshUnread]);

  const value = useMemo<UnreadContextValue>(
    () => ({ unreadCount, refreshUnread, setUnreadCount }),
    [unreadCount, refreshUnread],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  if (!ctx) {
    throw new Error('useUnread must be used within UnreadProvider');
  }
  return ctx;
}
