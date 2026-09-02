import { Link, useLocation } from 'react-router-dom';
import { Cloud, CloudOff, Leaf, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Search, Settings, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';
import { navItemByPath } from '../lib/nav';
import { useAuth } from '../cloud/AuthProvider';
import { useCloudStore } from '../cloud/store';

/**
 * Slim contextual header: page title, global search launcher and the few
 * truly-global actions (quick add, smart context, settings). The full
 * navigation lives in the sidebar (desktop) / bottom bar (mobile).
 */
export default function Header({ onOpenSmart, onOpenQuick }: { onOpenSmart: () => void; onOpenQuick: () => void }) {
  const t = useT();
  const location = useLocation();
  const settings = useAppStore((s) => s.settings);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebarCollapsed);
  const { cloudEnabled } = useAuth();
  const syncStatus = useCloudStore((s) => s.status);
  const pending = useCloudStore((s) => s.pending);

  const item = navItemByPath(location.pathname);
  const title = item ? t(item.labelKey) : t('app.name');
  const openPalette = () => window.dispatchEvent(new Event('aish:open-command-palette'));

  const now = new Date();
  const timeStr = now.toLocaleTimeString(settings.language === 'en' ? 'en' : 'ar', { hour: '2-digit', minute: '2-digit' });
  const showCloud = cloudEnabled && (syncStatus !== 'synced' || (pending ?? 0) > 0);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card/70 px-2.5 backdrop-blur-md md:px-3">
      {/* Sidebar toggle (desktop) */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="btn-icon hidden !h-8 !w-8 lg:inline-flex"
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
      >
        {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
      </button>

      {/* Brand on small screens (no sidebar) */}
      <Link to="/" className="flex min-w-0 items-center gap-2 lg:hidden" aria-label={t('app.name')}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-accent to-brand-dark text-white" aria-hidden="true">
          <Leaf className="h-4 w-4" />
        </span>
      </Link>

      {/* Contextual title */}
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-sm font-extrabold text-ink">{title}</h1>
        <span className="hidden text-[11px] tabular-nums text-ink-faint sm:inline" aria-label={timeStr}>{timeStr}</span>
      </div>

      {/* Search launcher */}
      <button
        type="button"
        onClick={openPalette}
        className="mx-auto hidden h-8 w-64 items-center gap-2 rounded-xl border border-line bg-elevated/60 px-2.5 text-start text-xs text-ink-faint transition hover:border-brand-lighter hover:bg-brand-soft/50 hover:text-ink-soft md:flex lg:w-80"
        aria-label={t('search.placeholder')}
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{t('search.placeholder')}</span>
        <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[10px] font-semibold text-ink-faint">Ctrl K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {/* Mobile search */}
        <button type="button" onClick={openPalette} className="btn-icon md:hidden" title={t('common.search')} aria-label={`${t('common.search')} (Ctrl+K)`}>
          <Search className="h-[18px] w-[18px]" />
        </button>

        {/* Cloud status (compact) */}
        {showCloud && (
          <span
            className={`chip !px-2 ${syncStatus === 'error' ? '!bg-danger-bg !text-danger' : syncStatus === 'offline' ? '!bg-warn-bg !text-warn' : ''}`}
            title={pending ? `${pending} تغييرات بانتظار المزامنة` : 'حالة المزامنة'}
          >
            {syncStatus === 'offline' || syncStatus === 'error' ? <CloudOff className="h-3.5 w-3.5" /> : syncStatus === 'syncing' || syncStatus === 'connecting' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
          </span>
        )}

        {/* Smart context drawer */}
        <button type="button" onClick={onOpenSmart} className="btn-icon hidden sm:inline-flex" title={t('smart.title')} aria-label={t('smart.title')}>
          <Sparkles className="h-[18px] w-[18px]" />
        </button>

        {/* Quick capture */}
        <button type="button" onClick={onOpenQuick} className="btn-icon" title={t('quickCapture.title')} aria-label={t('quickCapture.title')}>
          <Plus className="h-[18px] w-[18px]" />
        </button>

        <Link to="/settings" className="btn-icon" aria-label={t('nav.settings')} title={t('nav.settings')}>
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}
