import { Link } from 'react-router-dom';
import { Cloud, CloudOff, Leaf, Plus, RefreshCw, Search, Settings, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';
import { useAuth } from '../cloud/AuthProvider';
import { useCloudStore } from '../cloud/store';
import ProgressBadge from './gamification/ProgressBadge';
import SurpriseButton from './gamification/SurpriseButton';

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
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-line bg-card/60 px-4 backdrop-blur md:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px bg-gradient-to-r from-transparent via-brand-accent/70 to-transparent"
        aria-hidden="true"
      />
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark lg:flex" aria-hidden="true">
          <Leaf className="h-4 w-4" />
        </span>
        <div className="animate-riseIn">
          <p className="text-sm font-bold leading-tight text-ink">
            <span className="text-gradient">{dateStr}</span>
          </p>
          <p className="text-[11px] leading-tight text-ink-faint">
            {now.toLocaleTimeString(settings.language === 'en' ? 'en' : 'ar', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <ProgressBadge />
        <SurpriseButton label={false} className="!hidden !px-2 sm:!inline-flex" />
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
          <Search className="h-[18px] w-[18px]" />
        </button>
        <button onClick={onOpenQuick} className="btn-icon" title={t('quickCapture.title')} aria-label={t('quickCapture.title')}>
          <Plus className="h-[18px] w-[18px]" />
        </button>
        <button onClick={onOpenSmart} className="btn-icon" title={t('smart.openPanel')} aria-label={t('smart.openPanel')}>
          <Sparkles className="h-[18px] w-[18px]" />
        </button>
        <Link to="/settings" className="btn-icon" aria-label={t('nav.settings')}>
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}
