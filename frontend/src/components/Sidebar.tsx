import { NavLink } from 'react-router-dom';
import { Leaf, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { NAV_ITEMS, navGroups, type NavItem } from '../lib/nav';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

/**
 * Desktop sidebar: a compact, collapsible navigation rail.
 * Expanded = icon + label (grouped). Collapsed = icon-only rail.
 */
export default function Sidebar() {
  const t = useT();
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebarCollapsed);
  const items = NAV_ITEMS.filter((i) => sidebarVisible.includes(i.id));
  const sections = navGroups(items);

  return (
    <aside
      className={`relative z-10 hidden h-full shrink-0 flex-col border-e border-line bg-card/70 backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
      aria-label={t('app.name')}
    >
      {/* Brand */}
      <div
        className={`relative flex shrink-0 items-center gap-2.5 overflow-hidden px-3 pb-3 pt-4 ${
          collapsed ? 'justify-center px-0' : 'px-4'
        }`}
      >
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

      {/* Groups */}
      <nav className="flex-1 space-y-3 overflow-y-auto px-2 pb-2" aria-label={t('nav.mobile')}>
        {sections.map(({ group, items: groupItems }) => (
          <div key={group.id} className="space-y-0.5">
            {!collapsed && (
              <p className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{t(group.labelKey)}</p>
            )}
            {collapsed && <div className="mx-2 mb-1 mt-2 h-px bg-line" aria-hidden="true" />}
            {groupItems.map((item) => (
              <NavItemLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-line p-2">
        <button
          type="button"
          onClick={toggle}
          className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-ink-faint transition hover:bg-elevated hover:text-ink"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          {!collapsed && <span className="truncate">{t('nav.collapse')}</span>}
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
      title={collapsed ? `${label}` : `${label} — ${t(item.hintKey || '')}`}
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
          <Icon
            className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105 ${
              collapsed ? '' : ''
            }`}
            aria-hidden="true"
          />
          {!collapsed && <span className="truncate">{label}</span>}
          {!collapsed && isActive && <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
        </>
      )}
    </NavLink>
  );
}
