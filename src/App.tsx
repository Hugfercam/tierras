import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GroupProvider } from './contexts/GroupContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Spinner } from './components/ui/Button';
import { ApiError } from './lib/api';
import { DashboardPage } from './pages/DashboardPage';
import { GroupPage } from './pages/GroupPage';
import { InvitePage } from './pages/InvitePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConsentPage } from './pages/ConsentPage';
import { AccountPage } from './pages/AccountPage';
import { LegalPage } from './pages/LegalPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function ProtectedRoute() {
  const { user, isLoading, consentRequired } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="entry-loading">
        <Spinner size={26} />
        <p>Abriendo el atlas…</p>
      </div>
    );
  }
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (
    consentRequired &&
    location.pathname !== '/consentimiento' &&
    location.pathname !== '/cuenta'
  ) {
    return <Navigate to="/consentimiento" replace />;
  }
  return <Outlet />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegisterPage />} />
                <Route path="/privacidad" element={<LegalPage kind="privacy" />} />
                <Route path="/terminos" element={<LegalPage kind="terms" />} />
                <Route path="/cookies" element={<LegalPage kind="cookies" />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/consentimiento" element={<ConsentPage />} />
                  <Route
                    element={
                      <GroupProvider>
                        <AppShell />
                      </GroupProvider>
                    }
                  >
                    <Route path="/pasaporte" element={<DashboardPage />} />
                    <Route path="/panel" element={<Navigate to="/pasaporte" replace />} />
                    <Route path="/mapa" element={<MapPage />} />
                    <Route path="/ranking" element={<LeaderboardPage />} />
                    <Route path="/grupo" element={<GroupPage />} />
                    <Route path="/cuenta" element={<AccountPage />} />
                    <Route path="/unirse/:code" element={<InvitePage />} />
                  </Route>
                </Route>
                <Route path="/" element={<Navigate to="/pasaporte" replace />} />
                <Route path="*" element={<Navigate to="/pasaporte" replace />} />
              </Routes>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
