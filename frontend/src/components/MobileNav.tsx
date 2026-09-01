import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

const PRIMARY_IDS = new Set(['today', 'chat', 'safe', 'tasks']);

export default function MobileNav() {
  const t = useT();
  const location = useLocation();
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV_ITEMS.filter((i) => sidebarVisible.includes(i.id));
  const primaryItems = items.filter((i) => PRIMARY_IDS.has(i.id));
  const moreItems = items.filter((i) => !PRIMARY_IDS.has(i.id));
  const moreActive = moreItems.some((item) => location.pathname === item.path);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

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
            className="card absolute inset-x-4 bottom-24 max-h-[62dvh] overflow-y-auto p-2.5 shadow-card-hover animate-fadeIn"
          >
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="text-sm font-bold text-ink">{t('nav.more')}</p>
              <button type="button" className="btn-icon" onClick={() => setMoreOpen(false)} aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map(({ id, path, labelKey, icon: Icon }) => (
                <NavLink
                  key={id}
                  to={path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                      isActive ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-elevated hover:text-ink'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="mobile-safe-nav fixed inset-x-0 bottom-0 z-50 flex min-h-16 items-center justify-around border-t border-line bg-card/95 px-1.5 py-1.5 backdrop-blur lg:hidden"
        aria-label={t('nav.mobile')}
      >
        {primaryItems.map(({ id, path, labelKey, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `relative flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                isActive
                  ? 'bg-brand-soft text-brand-dark'
                  : 'text-ink-faint hover:text-ink-soft'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -top-1.5 mx-auto h-0.5 w-7 rounded-pill bg-brand" aria-hidden="true" />}
                <Icon className={`h-5 w-5 ${isActive ? 'scale-105' : ''} transition-transform`} />
                <span>{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={`flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            moreActive || moreOpen ? 'bg-brand-soft text-brand-dark' : 'text-ink-faint'
          }`}
        >
          <Menu className="h-5 w-5" />
          <span>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
