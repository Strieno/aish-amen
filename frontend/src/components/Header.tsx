import { Link } from 'react-router-dom';
import { Cloud, CloudOff, Plus, RefreshCw, Search, Settings, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';
import { useAuth } from '../cloud/AuthProvider';
import { useCloudStore } from '../cloud/store';

export default function Header({ onOpenSmart, onOpenQuick }: { onOpenSmart: () => void; onOpenQuick: () => void }) {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const { cloudEnabled } = useAuth();
  const syncStatus = useCloudStore((s) => s.status);
  const pending = useCloudStore((s) => s.pending);

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat(settings.language === 'en' ? 'en' : 'ar', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  return (
    <header className="relative z-10 flex items-center justify-between border-b border-line bg-card/60 px-4 py-3 backdrop-blur md:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px bg-gradient-to-r from-transparent via-brand-accent/70 to-transparent"
        aria-hidden="true"
      />
      <div className="animate-riseIn">
        <p className="text-sm font-extrabold text-ink md:text-base">
          <span className="text-gradient">{dateStr}</span>
        </p>
        <p className="text-xs text-ink-faint">
          {now.toLocaleTimeString(settings.language === 'en' ? 'en' : 'ar', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {cloudEnabled && (
          <Link
            to="/settings"
            className={`chip !px-2.5 ${syncStatus === 'error' ? '!bg-danger-bg !text-danger' : syncStatus === 'offline' ? '!bg-warn-bg !text-warn' : ''}`}
            title={pending ? `${pending} تغييرات بانتظار المزامنة` : syncStatus === 'synced' ? 'متزامن' : 'حالة المزامنة'}
          >
            {syncStatus === 'offline' || syncStatus === 'error' ? <CloudOff className="h-3.5 w-3.5" /> : syncStatus === 'syncing' || syncStatus === 'connecting' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{pending ? `${pending} معلّق` : syncStatus === 'synced' ? 'متزامن' : syncStatus === 'offline' ? 'دون اتصال' : 'مزامنة'}</span>
          </Link>
        )}
        {settings.privacy?.maxPrivacy && (
          <span className="chip">{t('settings.localOnly')}</span>
        )}
        <button
          onClick={() => window.dispatchEvent(new Event('aish:open-command-palette'))}
          className="btn-icon"
          title={`${t('common.search')} (Ctrl+K)`}
          aria-label={`${t('common.search')} (Ctrl+K)`}
        >
          <Search className="h-5 w-5" />
        </button>
        <button onClick={onOpenQuick} className="btn-icon" title={t('quickCapture.title')} aria-label={t('quickCapture.title')}>
          <Plus className="h-5 w-5" />
        </button>
        <button onClick={onOpenSmart} className="btn-icon" title={t('smart.openPanel')} aria-label={t('smart.openPanel')}>
          <Sparkles className="h-5 w-5" />
        </button>
        <Link to="/settings" className="btn-icon" aria-label={t('nav.settings')}>
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
