import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import { AuthProvider, useAuth } from './auth/AuthContext';
import { UnreadProvider } from './notifications/UnreadContext';
import { PwaChrome } from './components/PwaChrome';
import { TabBar } from './components/TabBar';
import { ThemeProvider } from './theme/ThemeContext';
import { useThemeColors } from './theme';

// ── Pages ──────────────────────────────────────────────────────────────────────
import { Login } from './pages/Login';
import { Mfa } from './pages/Mfa';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Notifications } from './pages/Notifications';
import { More } from './pages/More';
import { Consent } from './pages/Consent';

// ── Auth guard ─────────────────────────────────────────────────────────────────
function AuthGuard() {
  const { status } = useAuth();
  const colors = useThemeColors();

  if (status === 'restoring') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.ground,
          color: colors.muted,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Loading…
      </div>
    );
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// ── Tab layout (bottom bar + nested outlet) ────────────────────────────────────
function TabLayout() {
  return (
    <div className="portal-tabshell">
      <Outlet />
      <TabBar />
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <UnreadProvider>
            <PwaChrome />
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/mfa" element={<Mfa />} />

              {/* Protected routes */}
              <Route element={<AuthGuard />}>
                <Route element={<TabLayout />}>
                  <Route path="/home" element={<Home />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/alerts" element={<Notifications />} />
                  <Route path="/more" element={<More />} />
                  <Route path="/more/consent" element={<Consent />} />
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </UnreadProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
