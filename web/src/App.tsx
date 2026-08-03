import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { MfaPage } from './pages/MfaPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendancePage } from './pages/AttendancePage';
import { FraudFlagsPage } from './pages/FraudFlagsPage';
import { PendingRequestsPage } from './pages/PendingRequestsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { BranchesPage } from './pages/BranchesPage';
import { ShiftsPage } from './pages/ShiftsPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Spinner } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return <Spinner label="Checking session…" />;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-medium text-text">You do not have access to this page.</p>
        <p className="mt-1 text-xs text-muted">Contact an administrator if you believe this is a mistake.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout>
              <DashboardPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/attendance"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR', 'Branch Manager', 'Department Head']}>
                <AttendancePage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/fraud-flags"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR', 'Branch Manager']}>
                <FraudFlagsPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/requests"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <PendingRequestsPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/employees"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <EmployeesPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/branches"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <BranchesPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/shifts"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <ShiftsPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/schedules"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR', 'Branch Manager', 'Department Head']}>
                <SchedulesPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Layout>
              <NotFoundPage />
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
