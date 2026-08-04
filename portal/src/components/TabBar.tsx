import { NavLink } from 'react-router-dom';
import { Home, Clock, Bell, Menu } from 'lucide-react';
import { useUnread } from '../notifications/UnreadContext';

const tabs = [
  { path: '/home', label: 'Home', Icon: Home },
  { path: '/history', label: 'History', Icon: Clock },
  { path: '/alerts', label: 'Alerts', Icon: Bell },
  { path: '/more', label: 'More', Icon: Menu },
];

export function TabBar() {
  const { unreadCount } = useUnread();

  return (
    <nav className="portal-tabbar" aria-label="Main">
      <div className="portal-tabbar__inner">
        {tabs.map(({ path, label, Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => `portal-tabbar__item${isActive ? ' is-active' : ''}`}
          >
            <div style={{ position: 'relative', display: 'flex' }}>
              <Icon size={20} strokeWidth={2.25} aria-hidden />
              {path === '/alerts' && unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -11,
                    backgroundColor: 'var(--danger)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 999,
                    minWidth: 16,
                    height: 16,
                    paddingInline: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
