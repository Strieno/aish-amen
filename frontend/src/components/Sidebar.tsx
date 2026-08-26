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
    <aside className="hidden h-full w-64 shrink-0 flex-col border-e border-line bg-card lg:flex">
      <div className="flex items-center gap-3 px-6 pb-6 pt-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
          <Leaf className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-extrabold leading-tight text-ink">{t('app.name')}</p>
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
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                isActive ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-elevated hover:text-ink'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="m-4 rounded-2xl bg-brand-soft p-4">
        <div className="mb-1 flex items-center gap-2 text-brand-dark">
          <ShieldCheck className="h-4 w-4" />
          <p className="text-xs font-bold">{t('safe.title')}</p>
        </div>
        <p className="text-xs leading-relaxed text-ink-soft">عيش آمن — خطوة صغيرة واضحة الآن خير من خطة كاملة مربكة.</p>
      </div>
    </aside>
  );
}
