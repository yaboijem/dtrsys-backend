import { NavLink } from 'react-router-dom';
import { Home, Clock, Bell, Menu } from 'lucide-react';
import { useThemeColors, fontSize } from '../theme';
import { useUnread } from '../notifications/UnreadContext';

const tabs = [
  { path: '/home', label: 'Home', Icon: Home },
  { path: '/history', label: 'History', Icon: Clock },
  { path: '/alerts', label: 'Alerts', Icon: Bell },
  { path: '/more', label: 'More', Icon: Menu },
];

export function TabBar() {
  const colors = useThemeColors();
  const { unreadCount } = useUnread();

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopStyle: 'solid',
        borderTopColor: colors.border,
        display: 'flex',
        justifyContent: 'space-around',
        paddingTop: 8,
        paddingBottom: 8,
        zIndex: 40,
      }}
    >
      {tabs.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          style={({ isActive }) => ({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            color: isActive ? colors.band : colors.muted,
            textDecoration: 'none',
            fontSize: fontSize.micro,
            fontWeight: isActive ? '700' : '500',
          })}
        >
          <div style={{ position: 'relative' }}>
            <Icon size={22} />
            {path === '/alerts' && unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -8,
                  backgroundColor: colors.danger,
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: '700',
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
