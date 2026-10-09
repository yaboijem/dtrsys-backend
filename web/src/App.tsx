import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendancePage } from './pages/AttendancePage';
import { OpenSessionsPage } from './pages/OpenSessionsPage';
import { FraudFlagsPage } from './pages/FraudFlagsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { HomeLocationsPage } from './pages/HomeLocationsPage';
import { BranchesPage } from './pages/BranchesPage';
import { OrgStructurePage } from './pages/OrgStructurePage';
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
        path="/open-sessions"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <OpenSessionsPage />
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
        path="/home-locations"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR']}>
                <HomeLocationsPage />
              </RequireRole>
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/org-structure"
        element={
          <RequireAuth>
            <Layout>
              <RequireRole roles={['Super Admin', 'HR', 'Branch Manager', 'Department Head']}>
                <OrgStructurePage />
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
              <RequireRole roles={['Super Admin']}>
                <BranchesPage />
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
