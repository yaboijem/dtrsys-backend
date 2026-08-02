import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CalendarClock,
  Clock,
  Flag,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/cn';

const ALL_ROLES = ['Super Admin', 'HR', 'Branch Manager', 'Department Head'];

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} />, roles: ALL_ROLES },
  { to: '/attendance', label: 'Attendance', icon: <CalendarClock size={17} />, roles: ALL_ROLES },
  { to: '/fraud-flags', label: 'Fraud Flags', icon: <Flag size={17} />, roles: ['Super Admin', 'HR', 'Branch Manager'] },
  { to: '/schedules', label: 'Schedules', icon: <CalendarDays size={17} />, roles: ALL_ROLES },
  { to: '/employees', label: 'Employees', icon: <Users size={17} />, roles: ['Super Admin', 'HR'] },
  { to: '/branches', label: 'Branches', icon: <Building2 size={17} />, roles: ['Super Admin', 'HR'] },
  { to: '/shifts', label: 'Shifts', icon: <Clock size={17} />, roles: ['Super Admin', 'HR'] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(...item.roles));
  const hasAccess = visibleItems.length > 0;

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white">
            <ShieldCheck size={17} />
          </div>
          <div>
            <div className="text-sm font-bold text-text leading-tight">DTR Admin</div>
            <div className="text-[11px] text-muted leading-tight">Time &amp; Attendance</div>
          </div>
        </div>

        {hasAccess && (
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-blue-50 text-primary' : 'text-muted hover:bg-bg hover:text-text',
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {!hasAccess && (
          <div className="flex-1 px-4 py-6 text-xs text-muted">
            Your role does not grant access to any admin module yet.
          </div>
        )}

        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 truncate text-xs font-semibold text-text">
            {user?.employee?.full_name ?? user?.name}
          </div>
          <div className="mb-3 truncate text-[11px] text-muted">
            {user?.employee_id} · {user?.roles.join(', ')}
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-bg hover:text-danger cursor-pointer"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
