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
  Home,
  Layers,
  Leaf,
  Library,
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
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'today', path: '/', labelKey: 'nav.today', icon: Home },
  { id: 'chat', path: '/chat', labelKey: 'nav.chat', icon: MessageCircle },
  { id: 'safe', path: '/safe', labelKey: 'nav.safe', icon: ShieldCheck },
  { id: 'tasks', path: '/tasks', labelKey: 'nav.tasks', icon: ListTodo },
  { id: 'study', path: '/study', labelKey: 'nav.study', icon: GraduationCap },
  { id: 'work', path: '/work', labelKey: 'nav.work', icon: Briefcase },
  { id: 'journal', path: '/journal', labelKey: 'nav.journal', icon: BookOpen },
  { id: 'goals', path: '/goals', labelKey: 'nav.goals', icon: CalendarClock },
  { id: 'gratitude', path: '/gratitude', labelKey: 'nav.gratitude', icon: Heart },
  { id: 'memory', path: '/memory', labelKey: 'nav.memory', icon: Brain },
  { id: 'knowledge', path: '/knowledge', labelKey: 'nav.knowledge', icon: Library },
  { id: 'graph', path: '/graph', labelKey: 'graph.title', icon: Network },
  { id: 'timeline', path: '/timeline', labelKey: 'timeline.title', icon: History },
  { id: 'audio', path: '/audio', labelKey: 'nav.audio', icon: Music },
  { id: 'focus', path: '/focus', labelKey: 'nav.focus', icon: Timer },
  { id: 'insights', path: '/insights', labelKey: 'nav.insights', icon: Activity },
  { id: 'settings', path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export const LEAF = Leaf;
export const BOT = Bot;
export const MIC = Mic;
export const LAYERS = Layers;
