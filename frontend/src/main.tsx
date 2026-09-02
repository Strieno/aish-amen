import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import App from './App';
import './index.css';
import { useAppStore } from './lib/app-store';
import { useT } from './lib/i18n';
import { Spinner } from './components/ui';
import { liveBus } from './lib/live';
import AuthProvider from './cloud/AuthProvider';

const TodayPage = lazy(() => import('./pages/TodayPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const GratitudePage = lazy(() => import('./pages/GratitudePage'));
const StudyPage = lazy(() => import('./pages/StudyPage'));
const WorkPage = lazy(() => import('./pages/WorkPage'));
const SafeLivingPage = lazy(() => import('./pages/SafeLivingPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const AudioPage = lazy(() => import('./pages/AudioPage'));
const FocusPage = lazy(() => import('./pages/FocusPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const GraphPage = lazy(() => import('./pages/GraphPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

function PageFallback() {
  const t = useT();
  return (
    <div className="card flex min-h-40 items-center justify-center gap-3 p-6 text-sm font-semibold text-ink-soft" role="status" aria-live="polite">
      <Spinner className="h-5 w-5" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

function Boot() {
  const ready = useAppStore((s) => s.ready);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
    liveBus.start(); // live auto-updates across the whole app
  }, [loadSettings]);

  if (!ready) {
    return (
      <div className="relative flex h-dvh items-center justify-center overflow-hidden bg-canvas text-ink">
        <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-brand-soft/80 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-brand-lighter/50 blur-3xl" aria-hidden="true" />
        <div className="relative text-center">
          <p className="mb-4 animate-floatY text-3xl font-extrabold">
            <span className="text-gradient">عِش آمن</span>
          </p>
          <Spinner className="h-8 w-8" />
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route element={<Suspense fallback={<PageFallback />}><Outlet /></Suspense>}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/safe" element={<SafeLivingPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/gratitude" element={<GratitudePage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/audio" element={<AudioPage />} />
            <Route path="/focus" element={<FocusPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Boot />
    </AuthProvider>
  </React.StrictMode>,
);
