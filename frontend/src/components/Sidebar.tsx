import { NavLink } from 'react-router-dom';
import { Leaf, ShieldCheck } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

export default function Sidebar() {
  const t = useT();
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const items = NAV_ITEMS.filter((i) => sidebarVisible.includes(i.id));

  return (
    <aside className="relative z-10 hidden h-full w-56 shrink-0 flex-col border-e border-line bg-card/80 backdrop-blur-xl lg:flex">
      <div className="relative flex items-center gap-2.5 overflow-hidden px-5 pb-4 pt-5">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-accent via-brand to-brand-dark text-white shadow-button">
          <Leaf className="relative h-5 w-5" />
        </span>
        <div className="relative min-w-0">
          <p className="truncate text-base font-extrabold leading-tight text-ink">
            <span className="text-gradient">{t('app.name')}</span>
          </p>
          <p className="truncate text-[11px] leading-tight text-ink-faint">{t('app.tagline')}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3">
        {items.map(({ id, path, labelKey, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `nav-item group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-150 ${
                isActive
                  ? 'active bg-brand-soft text-brand-dark'
                  : 'text-ink-soft hover:bg-elevated hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="nav-glow" aria-hidden="true" />
                <Icon
                  className={`relative h-4 w-4 shrink-0 transition-transform duration-150 ${
                    isActive ? '' : 'group-hover:scale-110'
                  }`}
                />
                <span className="relative truncate">{t(labelKey)}</span>
                {isActive && <span className="relative ms-auto h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative m-2.5 mb-3 overflow-hidden rounded-xl border border-line bg-elevated/60 p-3">
        <div className="relative mb-0.5 flex items-center gap-1.5 text-brand-dark">
          <ShieldCheck className="h-3.5 w-3.5" />
          <p className="text-[11px] font-bold">{t('safe.title')}</p>
        </div>
        <p className="relative text-[11px] leading-relaxed text-ink-soft">خطوة صغيرة واضحة الآن خير من خطة كاملة مربكة.</p>
      </div>
    </aside>
  );
}
