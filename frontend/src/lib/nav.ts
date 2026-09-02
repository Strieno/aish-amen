import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  CalendarClock,
  GraduationCap,
  Heart,
  History,
  HelpCircle,
  Home,
  Layers,
  Leaf,
  Library,
  LifeBuoy,
  ListTodo,
  MessageCircle,
  Mic,
  Music,
  Network,
  Settings,
  ShieldCheck,
  Timer,
  TreePine,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  path: string;
  labelKey: string;
  /** Optional ultra-short label used by compact/bottom navigation (e.g. "مساعد"). */
  shortKey?: string;
  icon: LucideIcon;
  /** Navigation group the item belongs to (used by sidebar + more-menu). */
  group: NavGroupId;
  /** Short description / helper line (tooltips & search). */
  hintKey?: string;
}

export type NavGroupId = 'primary' | 'more' | 'system';

export interface NavGroup {
  id: NavGroupId;
  labelKey: string;
}

/** Ordered navigation groups (desktop sidebar & mobile "More" sheet). */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'primary', labelKey: 'nav.group.primary' },
  { id: 'more', labelKey: 'nav.more' },
  { id: 'system', labelKey: 'nav.group.system' },
];

export const NAV_ITEMS: NavItem[] = [
  // ---------- Primary (the whole app in 4 doors) ----------
  { id: 'today', path: '/', labelKey: 'nav.today', shortKey: 'nav.short.today', icon: Home, group: 'primary', hintKey: 'nav.hint.today' },
  { id: 'study', path: '/study', labelKey: 'nav.study', shortKey: 'nav.short.study', icon: GraduationCap, group: 'primary', hintKey: 'nav.hint.study' },
  { id: 'life', path: '/life', labelKey: 'nav.life', shortKey: 'nav.short.life', icon: TreePine, group: 'primary', hintKey: 'nav.hint.life' },
  { id: 'chat', path: '/chat', labelKey: 'nav.assistant', shortKey: 'nav.short.chat', icon: MessageCircle, group: 'primary', hintKey: 'nav.hint.chat' },

  // ---------- More (secondary tools, one tap away) ----------
  { id: 'tasks', path: '/tasks', labelKey: 'nav.tasks', shortKey: 'nav.short.tasks', icon: ListTodo, group: 'more', hintKey: 'nav.hint.tasks' },
  { id: 'safe', path: '/safe', labelKey: 'nav.safe', shortKey: 'nav.short.safe', icon: ShieldCheck, group: 'more', hintKey: 'nav.hint.safe' },
  { id: 'gratitude', path: '/gratitude', labelKey: 'nav.gratitude', shortKey: 'nav.short.gratitude', icon: Heart, group: 'more', hintKey: 'nav.hint.gratitude' },
  { id: 'journal', path: '/journal', labelKey: 'nav.journal', shortKey: 'nav.short.journal', icon: BookOpen, group: 'more', hintKey: 'nav.hint.journal' },
  { id: 'goals', path: '/goals', labelKey: 'nav.goals', shortKey: 'nav.short.goals', icon: CalendarClock, group: 'more', hintKey: 'nav.hint.goals' },
  { id: 'work', path: '/work', labelKey: 'nav.work', shortKey: 'nav.short.work', icon: Briefcase, group: 'more', hintKey: 'nav.hint.work' },
  { id: 'memory', path: '/memory', labelKey: 'nav.memory', shortKey: 'nav.short.memory', icon: Brain, group: 'more', hintKey: 'nav.hint.memory' },
  { id: 'knowledge', path: '/knowledge', labelKey: 'nav.knowledge', shortKey: 'nav.short.knowledge', icon: Library, group: 'more', hintKey: 'nav.hint.knowledge' },
  { id: 'focus', path: '/focus', labelKey: 'nav.focus', shortKey: 'nav.short.focus', icon: Timer, group: 'more', hintKey: 'nav.hint.focus' },
  { id: 'audio', path: '/audio', labelKey: 'nav.audio', shortKey: 'nav.short.audio', icon: Music, group: 'more', hintKey: 'nav.hint.audio' },
  { id: 'insights', path: '/insights', labelKey: 'nav.insights', shortKey: 'nav.short.insights', icon: Activity, group: 'more', hintKey: 'nav.hint.insights' },
  { id: 'graph', path: '/graph', labelKey: 'graph.title', shortKey: 'nav.short.graph', icon: Network, group: 'more', hintKey: 'nav.hint.graph' },
  { id: 'timeline', path: '/timeline', labelKey: 'timeline.title', shortKey: 'nav.short.timeline', icon: History, group: 'more', hintKey: 'nav.hint.timeline' },

  // ---------- System ----------
  { id: 'help', path: '/help', labelKey: 'nav.help', shortKey: 'nav.short.help', icon: LifeBuoy, group: 'system', hintKey: 'nav.hint.help' },
  { id: 'settings', path: '/settings', labelKey: 'nav.settings', shortKey: 'nav.short.settings', icon: Settings, group: 'system', hintKey: 'nav.hint.settings' },
];

/** Items shown in the mobile bottom bar (4 + the More button). */
export const MOBILE_PRIMARY_IDS: NavItem['id'][] = ['today', 'study', 'life', 'chat'];

/** Navigation groups with their items, in display order. */
export function navGroups(items: NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group.id),
  })).filter((section) => section.items.length > 0);
}

/** Find an item by its route path. */
export function navItemByPath(path: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => (i.path === '/' ? path === '/' : path.startsWith(i.path)));
}

export function navItemById(id: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.id === id);
}

export const LEAF = Leaf;
export const BOT = Bot;
export const MIC = Mic;
export const LAYERS = Layers;
export const HELP = HelpCircle;
