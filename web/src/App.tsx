import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';

const ChatView = lazy(() => import('./components/ChatView').then(m => ({ default: m.ChatView })));
const MemoryView = lazy(() => import('./components/MemoryView').then(m => ({ default: m.MemoryView })));
const VoiceView = lazy(() => import('./components/VoiceView').then(m => ({ default: m.VoiceView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const TeamWorkspace = lazy(() => import('./components/team').then(m => ({ default: m.TeamWorkspace })));

const IDLE_MS = 15 * 60 * 1000;

function useIdleLogout() {
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (token) {
      timerRef.current = setTimeout(logout, IDLE_MS);
    }
  }, [token, logout]);

  useEffect(() => {
    if (!token) return;
    reset();
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [token, reset]);
}

export function App() {
  const token = useStore((s) => s.token);
  const loadProviders = useStore((s) => s.loadProviders);
  useIdleLogout();

  useEffect(() => {
    if (token) loadProviders();
  }, [token, loadProviders]);

  if (!token) {
    return <LoginPage />;
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<Layout><ChatView /></Layout>} />
        <Route path="/team" element={<Layout><TeamWorkspace /></Layout>} />
        <Route path="/memory" element={<Layout><MemoryView /></Layout>} />
        <Route path="/voice" element={<Layout><VoiceView /></Layout>} />
        <Route path="/settings" element={<Layout><SettingsView /></Layout>} />
        <Route path="/dashboard" element={<Layout><DashboardView /></Layout>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
