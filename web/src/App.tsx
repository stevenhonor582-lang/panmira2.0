import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { LoginPage } from './components/LoginPage';
import { ChatLayout } from './components/ChatLayout';
import { AdminLayout } from './components/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

const ChatView = lazy(() => import('./components/ChatView').then(m => ({ default: m.ChatView })));
const MemoryView = lazy(() => import('./components/MemoryView').then(m => ({ default: m.MemoryView })));
const VoiceView = lazy(() => import('./components/VoiceView').then(m => ({ default: m.VoiceView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const ModelsView = lazy(() => import('./components/ModelsView').then(m => ({ default: m.ModelsView })));
const KnowledgeView = lazy(() => import('./components/KnowledgeView').then(m => ({ default: m.KnowledgeView })));
const AgentsView = lazy(() => import('./components/AgentsView').then(m => ({ default: m.AgentsView })));
const ResourcesView = lazy(() => import('./components/ResourcesView').then(m => ({ default: m.ResourcesView })));
const ChannelsView = lazy(() => import('./components/ChannelsView').then(m => ({ default: m.ChannelsView })));
const ReportsView = lazy(() => import('./components/ReportsView').then(m => ({ default: m.ReportsView })));
const CostView = lazy(() => import('./components/CostView').then(m => ({ default: m.CostView })));
const AuditView = lazy(() => import('./components/AuditView').then(m => ({ default: m.AuditView })));
const StatusView = lazy(() => import('./components/StatusView').then(m => ({ default: m.StatusView })));
const AlertsView = lazy(() => import('./components/AlertsView').then(m => ({ default: m.AlertsView })));
const DiagnoseView = lazy(() => import('./components/DiagnoseView').then(m => ({ default: m.DiagnoseView })));
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
        <Route path="/" element={<Navigate to="/app" replace />} />

        {/* Admin routes: /app/* with AdminLayout + Sidebar */}
        <Route path="/app" element={<AdminLayout><DashboardView /></AdminLayout>} />
        <Route path="/app/models" element={<AdminLayout><ModelsView /></AdminLayout>} />
        <Route path="/app/knowledge" element={<AdminLayout><KnowledgeView /></AdminLayout>} />
        <Route path="/app/resources" element={<AdminLayout><ResourcesView /></AdminLayout>} />
        <Route path="/app/agents" element={<AdminLayout><AgentsView /></AdminLayout>} />
        <Route path="/app/channels" element={<AdminLayout><ChannelsView /></AdminLayout>} />
        <Route path="/app/permissions" element={<AdminLayout><DashboardView /></AdminLayout>} />
        <Route path="/app/status" element={<AdminLayout><StatusView /></AdminLayout>} />
        <Route path="/app/alerts" element={<AdminLayout><AlertsView /></AdminLayout>} />
        <Route path="/app/reports" element={<AdminLayout><ReportsView /></AdminLayout>} />
        <Route path="/app/cost" element={<AdminLayout><CostView /></AdminLayout>} />
        <Route path="/app/oauth-clients" element={<AdminLayout><DashboardView /></AdminLayout>} />
        <Route path="/app/audit" element={<AdminLayout><AuditView /></AdminLayout>} />

        {/* Chat routes: ChatLayout (preserves existing chat UI) */}
        <Route path="/app/chat" element={<ChatLayout><ChatView /></ChatLayout>} />
        <Route path="/app/team" element={<ChatLayout><TeamWorkspace /></ChatLayout>} />
        <Route path="/app/memory" element={<ChatLayout><MemoryView /></ChatLayout>} />
        <Route path="/app/voice" element={<ChatLayout><VoiceView /></ChatLayout>} />
        <Route path="/app/settings" element={<ChatLayout><SettingsView /></ChatLayout>} />

        {/* Backward compat: /admin/* and old paths redirect */}
        <Route path="/admin/*" element={<Navigate to="/app/settings" replace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
