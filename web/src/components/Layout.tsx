import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CalendarClock,
  Clock,
  Flag,
  Inbox,
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
  { to: '/requests', label: 'Requests', icon: <Inbox size={17} />, roles: ['Super Admin', 'HR'] },
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
      <aside className="flex w-56 shrink-0 flex-col border-r border-deep-border bg-deep">
        <div className="flex items-center gap-2.5 border-b border-deep-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-deep-2 ring-1 ring-deep-border">
            <ShieldCheck size={17} className="text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 leading-tight">DTR Admin</div>
            <div className="text-[11px] text-slate-400 leading-tight">Time &amp; Attendance</div>
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
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors border-l border-transparent',
                    isActive
                      ? 'border-l-cyan-300 bg-deep-2 text-cyan-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
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
          <div className="flex-1 px-4 py-6 text-xs text-slate-400">
            Your role does not grant access to any admin module yet.
          </div>
        )}

        <div className="border-t border-deep-border px-4 py-3">
          <div className="mb-2 truncate text-xs font-semibold text-slate-100">
            {user?.employee?.full_name ?? user?.name}
          </div>
          <div className="mb-3 truncate font-mono text-[11px] tnum text-slate-400">
            {user?.employee_id} · {user?.roles?.join(', ') ?? ''}
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-red-300 cursor-pointer"
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
