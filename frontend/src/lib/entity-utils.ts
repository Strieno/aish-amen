import {
  BookOpen,
  Brain,
  Briefcase,
  CalendarClock,
  FileText,
  GraduationCap,
  Heart,
  ListTodo,
  MessageCircle,
  Network,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from 'lucide-react';

/** Map an entity type to its detail route. */
export function entityRoute(type: string, id: string): string {
  switch (type) {
    case 'task': return `/tasks?id=${id}`;
    case 'journal': return `/journal?entry=${id}`;
    case 'goal': case 'milestone': return `/goals`;
    case 'course': case 'exam': return `/study`;
    case 'conversation': return `/chat?conv=${id}`;
    case 'memory': return `/memory`;
    case 'work_note': return `/work`;
    case 'safe_living_plan': return `/safe`;
    case 'focus_session': return `/focus`;
    case 'checkin': return '/safe';
    case 'document': return '/knowledge';
    default: return '/';
  }
}

export function entityIcon(type: string): LucideIcon {
  switch (type) {
    case 'task': return ListTodo;
    case 'journal': return BookOpen;
    case 'goal': return CalendarClock;
    case 'milestone': return CalendarClock;
    case 'course': return GraduationCap;
    case 'exam': return GraduationCap;
    case 'conversation': return MessageCircle;
    case 'memory': return Brain;
    case 'work_note': return Briefcase;
    case 'safe_living_plan': return ShieldCheck;
    case 'focus_session': return Timer;
    case 'checkin': return Heart;
    case 'document': return FileText;
    default: return Network;
  }
}

export const RELATIONSHIP_LABELS: Record<string, string> = {
  related_to: 'مرتبط',
  supports: 'يدعم',
  blocks: 'يعيق',
  caused_by: 'نتيجة',
  discussed_in: 'نوقش في',
  evidence_for: 'دليل على',
  belongs_to: 'ينتمي إلى',
  derived_from: 'مشتق من',
  contributes_to: 'يساهم في',
};
