import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CalendarClock,
  Clock,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { dashboardSummary } from '../api/endpoints';
import { cn } from '../lib/cn';
import { Avatar } from './ui';

const ALL_ROLES = ['Super Admin', 'HR', 'Branch Manager', 'Department Head'];

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: string[];
  badgeKey?: 'fraud';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, roles: ALL_ROLES },
  { to: '/attendance', label: 'Attendance', icon: <CalendarClock size={18} />, roles: ALL_ROLES },
  {
    to: '/fraud-flags',
    label: 'Fraud Flags',
    icon: <Flag size={18} />,
    roles: ['Super Admin', 'HR', 'Branch Manager'],
    badgeKey: 'fraud',
  },
  { to: '/schedules', label: 'Schedules', icon: <CalendarDays size={18} />, roles: ALL_ROLES },
  { to: '/employees', label: 'Employees', icon: <Users size={18} />, roles: ['Super Admin', 'HR'] },
  { to: '/branches', label: 'Branches', icon: <Building2 size={18} />, roles: ['Super Admin', 'HR'] },
  { to: '/shifts', label: 'Shifts', icon: <Clock size={18} />, roles: ['Super Admin', 'HR'] },
];

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SidebarNav({
  visibleItems,
  collapsed,
  badges,
  onNavigate,
}: {
  visibleItems: NavItem[];
  collapsed: boolean;
  badges: { fraud: number };
  onNavigate?: () => void;
}) {
  return (
    <nav className={cn('flex-1 space-y-0.5 overflow-y-auto py-3', collapsed ? 'px-1.5' : 'px-2')}>
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex min-h-10 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors',
              collapsed ? 'justify-center px-2' : 'px-3',
              isActive
                ? 'bg-deep-2 text-teal-300'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-teal-400" aria-hidden />
              )}
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {item.badgeKey === 'fraud' && <NavBadge count={badges.fraud} />}
                </>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, hasRole, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState({ fraud: 0 });

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(...item.roles));
  const hasAccess = visibleItems.length > 0;
  const displayName = user?.employee?.full_name ?? user?.name ?? 'User';
  const activeLabel =
    visibleItems.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
    )?.label ?? 'Admin';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void dashboardSummary(token)
      .then((s) => {
        if (!cancelled) {
          setBadges({
            fraud: s.open_fraud_flags ?? 0,
          });
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [token, location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const brand = (
    <div className={cn('flex items-center border-b border-deep-border', collapsed ? 'justify-center px-2 py-4' : 'gap-2.5 px-4 py-4')}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-deep-2 ring-1 ring-deep-border">
        <ShieldCheck size={18} className="text-teal-300" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight text-slate-100">DTR Admin</div>
          <div className="truncate text-[11px] leading-tight text-slate-400">Time &amp; Attendance</div>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className={cn('border-t border-deep-border', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
      {!collapsed ? (
        <>
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <Avatar name={displayName} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-100">{displayName}</div>
              <div className="truncate font-mono text-[10px] tnum text-slate-400">
                {user?.employee_id} · {user?.roles?.[0] ?? ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-red-300"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          title="Sign out"
          onClick={() => {
            signOut();
            navigate('/login');
          }}
          className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-red-300"
        >
          <LogOut size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 bg-bg">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-deep-border bg-deep transition-[width] lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-60',
        )}
      >
        {brand}
        {hasAccess ? (
          <SidebarNav visibleItems={visibleItems} collapsed={collapsed} badges={badges} />
        ) : (
          <div className="flex-1 px-4 py-6 text-xs text-slate-400">No modules for your role.</div>
        )}
        <div className="border-t border-deep-border px-2 py-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            {!collapsed && <span className="text-xs font-medium">Collapse</span>}
          </button>
        </div>
        {footer}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-deep/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-deep shadow-xl">
            <div className="absolute right-2 top-2 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-slate-300 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {brand}
            {hasAccess && (
              <SidebarNav
                visibleItems={visibleItems}
                collapsed={false}
                badges={badges}
                onNavigate={() => setMobileOpen(false)}
              />
            )}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-text"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text">{activeLabel}</div>
            <div className="truncate text-[11px] text-muted">DTR Admin</div>
          </div>
          <Avatar name={displayName} size="sm" />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="page-shell">{children}</div>
        </main>
      </div>
    </div>
  );
}
