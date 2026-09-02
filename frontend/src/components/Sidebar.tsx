import { NavLink } from 'react-router-dom';
import { Leaf, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { NAV_ITEMS, navGroups, type NavItem } from '../lib/nav';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

/**
 * Desktop sidebar: 4 primary doors (Today / Study / Life / AI), then a
 * collapsible "More" group, with Help & Settings pinned at the bottom.
 * Collapsible to an icon-only rail.
 */
export default function Sidebar() {
  const t = useT();
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebarCollapsed);

  const items = NAV_ITEMS.filter((i) => sidebarVisible.includes(i.id));
  const sections = navGroups(items);
  const primary = sections.find((s) => s.group.id === 'primary');
  const more = sections.find((s) => s.group.id === 'more');
  const system = sections.find((s) => s.group.id === 'system');

  return (
    <aside
      className={`relative z-10 hidden h-full shrink-0 flex-col border-e border-line bg-card/70 backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
      aria-label={t('app.name')}
    >
      {/* Brand */}
      <div className={`relative flex shrink-0 items-center gap-2.5 overflow-hidden pb-3 pt-4 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-accent via-brand to-brand-dark text-white shadow-button" aria-hidden="true">
          <Leaf className="h-5 w-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold leading-tight text-ink">{t('app.name')}</p>
            <p className="truncate text-[11px] leading-tight text-ink-faint">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t('nav.mobile')}>
        {primary && (
          <div className="space-y-0.5">
            {primary.items.map((item) => (
              <NavItemLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>
        )}

        {more && (
          <div className="mt-3">
            {!collapsed ? (
              <p className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{t('nav.more')}</p>
            ) : (
              <div className="mx-2 mb-1 mt-2 h-px bg-line" aria-hidden="true" />
            )}
            <div className="space-y-0.5">
              {more.items.map((item) => (
                <NavItemLink key={item.id} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* System (pinned) */}
      <div className="shrink-0 border-t border-line px-2 py-1.5">
        {!collapsed && <p className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{t('nav.group.system')}</p>}
        <div className="space-y-0.5">
          {system?.items.map((item) => (
            <NavItemLink key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="mt-1 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-ink-faint transition hover:bg-elevated hover:text-ink"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const t = useT();
  const label = t(item.labelKey);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={collapsed ? label : `${label} — ${t(item.hintKey || '')}`}
      aria-label={label}
      className={({ isActive }) =>
        `group flex min-h-9 items-center rounded-lg text-[13px] font-semibold transition-colors duration-150 ${
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'
        } ${
          isActive
            ? 'bg-brand-soft text-brand-dark'
            : 'text-ink-soft hover:bg-elevated hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105" aria-hidden="true" />
          {!collapsed && <span className="truncate">{label}</span>}
          {!collapsed && isActive && <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
        </>
      )}
    </NavLink>
  );
}
