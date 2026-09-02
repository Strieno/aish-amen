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

export type NavGroupId = 'daily' | 'life' | 'explore' | 'system';

export interface NavGroup {
  id: NavGroupId;
  labelKey: string;
}

/** Ordered navigation groups (desktop sidebar & mobile "More" sheet). */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'daily', labelKey: 'nav.group.daily' },
  { id: 'life', labelKey: 'nav.group.life' },
  { id: 'explore', labelKey: 'nav.group.explore' },
  { id: 'system', labelKey: 'nav.group.system' },
];

export const NAV_ITEMS: NavItem[] = [
  // ---------- Daily ----------
  { id: 'today', path: '/', labelKey: 'nav.today', shortKey: 'nav.short.today', icon: Home, group: 'daily', hintKey: 'nav.hint.today' },
  { id: 'safe', path: '/safe', labelKey: 'nav.safe', shortKey: 'nav.short.safe', icon: ShieldCheck, group: 'daily', hintKey: 'nav.hint.safe' },
  { id: 'study', path: '/study', labelKey: 'nav.study', shortKey: 'nav.short.study', icon: GraduationCap, group: 'daily', hintKey: 'nav.hint.study' },
  { id: 'chat', path: '/chat', labelKey: 'nav.assistant', shortKey: 'nav.short.chat', icon: MessageCircle, group: 'daily', hintKey: 'nav.hint.chat' },
  { id: 'tasks', path: '/tasks', labelKey: 'nav.tasks', shortKey: 'nav.short.tasks', icon: ListTodo, group: 'daily', hintKey: 'nav.hint.tasks' },

  // ---------- Life ----------
  { id: 'gratitude', path: '/gratitude', labelKey: 'nav.gratitude', shortKey: 'nav.short.gratitude', icon: Heart, group: 'life', hintKey: 'nav.hint.gratitude' },
  { id: 'journal', path: '/journal', labelKey: 'nav.journal', shortKey: 'nav.short.journal', icon: BookOpen, group: 'life', hintKey: 'nav.hint.journal' },
  { id: 'goals', path: '/goals', labelKey: 'nav.goals', shortKey: 'nav.short.goals', icon: CalendarClock, group: 'life', hintKey: 'nav.hint.goals' },
  { id: 'work', path: '/work', labelKey: 'nav.work', shortKey: 'nav.short.work', icon: Briefcase, group: 'life', hintKey: 'nav.hint.work' },
  { id: 'memory', path: '/memory', labelKey: 'nav.memory', shortKey: 'nav.short.memory', icon: Brain, group: 'life', hintKey: 'nav.hint.memory' },
  { id: 'knowledge', path: '/knowledge', labelKey: 'nav.knowledge', shortKey: 'nav.short.knowledge', icon: Library, group: 'life', hintKey: 'nav.hint.knowledge' },
  { id: 'focus', path: '/focus', labelKey: 'nav.focus', shortKey: 'nav.short.focus', icon: Timer, group: 'life', hintKey: 'nav.hint.focus' },
  { id: 'audio', path: '/audio', labelKey: 'nav.audio', shortKey: 'nav.short.audio', icon: Music, group: 'life', hintKey: 'nav.hint.audio' },

  // ---------- Explore ----------
  { id: 'insights', path: '/insights', labelKey: 'nav.insights', shortKey: 'nav.short.insights', icon: Activity, group: 'explore', hintKey: 'nav.hint.insights' },
  { id: 'graph', path: '/graph', labelKey: 'graph.title', shortKey: 'nav.short.graph', icon: Network, group: 'explore', hintKey: 'nav.hint.graph' },
  { id: 'timeline', path: '/timeline', labelKey: 'timeline.title', shortKey: 'nav.short.timeline', icon: History, group: 'explore', hintKey: 'nav.hint.timeline' },

  // ---------- System ----------
  { id: 'help', path: '/help', labelKey: 'nav.help', shortKey: 'nav.short.help', icon: LifeBuoy, group: 'system', hintKey: 'nav.hint.help' },
  { id: 'settings', path: '/settings', labelKey: 'nav.settings', shortKey: 'nav.short.settings', icon: Settings, group: 'system', hintKey: 'nav.hint.settings' },
];

/** Items shown in the mobile bottom bar (keep 4 — rest lives in "More"). */
export const MOBILE_PRIMARY_IDS: NavItem['id'][] = ['today', 'safe', 'study', 'chat'];

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

export const LEAF = Leaf;
export const BOT = Bot;
export const MIC = Mic;
export const LAYERS = Layers;
export const HELP = HelpCircle;
