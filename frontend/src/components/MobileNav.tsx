import { useEffect, useState } from 'react';
import { LayoutGrid, Plus, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { MOBILE_PRIMARY_IDS, NAV_ITEMS, navGroups, type NavItem } from '../lib/nav';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

/**
 * Mobile bottom navigation: 4 primary doors (Today / Study / Life / AI)
 * + a "More" sheet that holds every secondary section, grouped.
 * Everything stays 1–2 taps away.
 */
export default function MobileNav() {
  const t = useT();
  const location = useLocation();
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const [moreOpen, setMoreOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => sidebarVisible.includes(i.id));
  const primaryItems = items.filter((i) => MOBILE_PRIMARY_IDS.includes(i.id));
  const moreItems = items.filter((i) => !MOBILE_PRIMARY_IDS.includes(i.id));
  const moreSections = navGroups(moreItems);
  const moreActive = moreItems.some((item) => item.path !== '/' && location.pathname.startsWith(item.path));

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  const openQuick = () => window.dispatchEvent(new Event('aish:open-quick-capture'));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/30"
            onClick={() => setMoreOpen(false)}
            aria-label={t('common.close')}
          />
          <div
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.more')}
            className="card absolute inset-x-2 bottom-20 max-h-[min(68dvh,560px)] overflow-y-auto bg-card p-2 animate-fadeIn"
          >
            <div className="mb-1 flex items-center justify-between px-1.5 py-1">
              <p className="text-sm font-bold text-ink">{t('nav.more')}</p>
              <button type="button" className="btn-icon !h-7 !w-7" onClick={() => setMoreOpen(false)} aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick capture — always one tap from More */}
            <button
              type="button"
              onClick={() => { setMoreOpen(false); openQuick(); }}
              className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white shadow-button transition active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> {t('quickActions.capture')}
            </button>

            {moreSections.map(({ group, items: groupItems }) => (
              <div key={group.id} className="mb-2">
                <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{t(group.labelKey)}</p>
                <div className="grid grid-cols-2 gap-1">
                  {groupItems.map((item) => (
                    <MobileMoreItem key={item.id} item={item} onClose={() => setMoreOpen(false)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav
        className="mobile-safe-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-stretch border-t border-line bg-card/95 px-1 pb-1 pt-1 backdrop-blur lg:hidden"
        aria-label={t('nav.mobile')}
      >
        {primaryItems.map((item) => (
          <MobilePrimaryTab key={item.id} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors ${
            moreActive || moreOpen ? 'bg-brand-soft text-brand-dark' : 'text-ink-faint hover:text-ink-soft'
          }`}
        >
          <LayoutGrid className={`h-5 w-5 ${moreActive ? 'text-brand-dark' : ''}`} />
          <span className="max-w-full truncate">{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}

function MobilePrimaryTab({ item }: { item: NavItem }) {
  const t = useT();
  const Icon = item.icon;
  const label = item.shortKey ? t(item.shortKey) : t(item.labelKey);
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      aria-label={t(item.labelKey)}
      className={({ isActive }) =>
        `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors duration-150 ${
          isActive ? 'bg-brand-soft text-brand-dark' : 'text-ink-faint hover:text-ink-soft'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-0 mx-auto h-0.5 w-6 rounded-pill bg-brand" aria-hidden="true" />}
          <Icon className={`h-5 w-5 ${isActive ? '' : ''}`} aria-hidden="true" />
          <span className="max-w-full truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileMoreItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const t = useT();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      onClick={onClose}
      title={t(item.hintKey || '')}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-[13px] font-semibold transition ${
          isActive ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-elevated hover:text-ink'
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </NavLink>
  );
}
