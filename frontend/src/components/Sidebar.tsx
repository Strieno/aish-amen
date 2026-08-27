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
    <aside className="relative z-10 hidden h-full w-64 shrink-0 flex-col border-e border-line bg-card/80 backdrop-blur-xl lg:flex">
      <div className="relative flex items-center gap-3 overflow-hidden px-6 pb-6 pt-7">
        <div className="absolute -top-10 -start-10 h-32 w-32 rounded-full bg-brand-soft/80 blur-2xl" aria-hidden="true" />
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-accent via-brand to-brand-dark text-white shadow-button">
          <span className="absolute inset-0 rounded-2xl animate-glowPulse" aria-hidden="true" />
          <Leaf className="relative h-6 w-6 animate-breathe" />
        </span>
        <div className="relative">
          <p className="text-lg font-extrabold leading-tight text-ink">
            <span className="text-gradient">{t('app.name')}</span>
          </p>
          <p className="text-xs leading-tight text-ink-faint">{t('app.tagline')}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4">
        {items.map(({ id, path, labelKey, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `nav-item group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'active bg-brand-soft text-brand-dark shadow-card'
                  : 'text-ink-soft hover:-translate-y-0.5 hover:bg-elevated hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="nav-glow" aria-hidden="true" />
                <Icon
                  className={`relative h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${
                    isActive ? 'animate-breathe' : 'group-hover:scale-110 group-hover:-rotate-6'
                  }`}
                />
                <span className="relative truncate">{t(labelKey)}</span>
                {isActive && <span className="relative ms-auto h-1.5 w-1.5 rounded-full bg-brand animate-breathe" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative m-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-soft via-card to-brand-lighter/40 p-4 shadow-card">
        <span className="absolute -bottom-6 -end-6 h-20 w-20 rounded-full bg-brand-accent/20 blur-xl" aria-hidden="true" />
        <div className="relative mb-1 flex items-center gap-2 text-brand-dark">
          <ShieldCheck className="h-4 w-4 animate-floatY" />
          <p className="text-xs font-bold">{t('safe.title')}</p>
        </div>
        <p className="relative text-xs leading-relaxed text-ink-soft">عيش آمن — خطوة صغيرة واضحة الآن خير من خطة كاملة مربكة.</p>
      </div>
    </aside>
  );
}
