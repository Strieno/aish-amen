import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import Sidebar from './components/Sidebar';
import CommandPalette from './components/CommandPalette';
import AiAssistantPanel from './components/AiAssistantPanel';
import SmartContextPanel from './components/SmartContextPanel';
import QuickCapture from './components/QuickCapture';
import AmbientBackground from './components/AmbientBackground';
import ErrorBoundary from './components/ErrorBoundary';
import CompletionBurst from './components/visualizations/CompletionBurst';
import ProgressProvider from './components/gamification/ProgressProvider';
import ProgressPanel from './components/gamification/ProgressPanel';
import { initUiSounds, setUiSoundsEnabled, quietHoursActive } from './lib/sound';
import { useAppStore } from './lib/app-store';

export default function App() {
  const [smartOpen, setSmartOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<'task' | 'journal' | 'gratitude'>('task');
  const uiSounds = useAppStore((s) => s.settings.audio?.uiSounds);
  const quietHours = useAppStore((s) => s.settings.quietHours);

  useEffect(() => initUiSounds(), []);

  useEffect(() => {
    setUiSoundsEnabled(uiSounds !== false && !quietHoursActive(quietHours));
  }, [uiSounds, quietHours]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setQuickType('task');
        setQuickOpen(true);
      }
    };
    const onQuickEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: 'task' | 'journal' | 'gratitude' }>).detail;
      setQuickType(detail?.type ?? 'task');
      setQuickOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('aish:open-quick-capture', onQuickEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('aish:open-quick-capture', onQuickEvent);
    };
  }, []);

  return (
    <div className="relative flex h-dvh overflow-hidden bg-canvas text-ink">
      <AmbientBackground />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header onOpenSmart={() => setSmartOpen(true)} onOpenQuick={() => { setQuickType('task'); setQuickOpen(true); }} />
        <main className="flex-1 overflow-y-auto" id="main-content">
          <div className="mx-auto w-full max-w-6xl px-3 pb-24 pt-3 md:px-5 lg:pb-10 lg:pt-4">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <AiAssistantPanel />
      <SmartContextPanel open={smartOpen} onClose={() => setSmartOpen(false)} />
      <QuickCapture open={quickOpen} onClose={() => setQuickOpen(false)} initialType={quickType} />
      <CompletionBurst />
      <ProgressProvider />
      <ProgressPanel />
    </div>
  );
}
