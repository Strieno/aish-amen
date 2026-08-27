/**
 * WeeklyLifeMap — the last 7 days as a visual journey.
 * Each day is a circle whose fill reflects day quality; clicking shows details.
 */

import { useState } from 'react';
import { useApi } from '../../lib/useApi';

export interface WeekDay {
  date: string;
  quality: number; // 0..7
  mood?: string | null;
  stress?: number | null;
  energy?: number | null;
  tasksDone?: number;
  focusMinutes?: number;
  gratitude?: number;
  checkin?: boolean;
}

const MOOD_LABEL: Record<string, string> = { great: 'ممتاز', good: 'جيد', neutral: 'متزن', low: 'منخفض', bad: 'صعب' };

function dayName(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(new Date(`${dateStr}T00:00:00`));
  } catch {
    return dateStr.slice(5);
  }
}

export default function WeeklyLifeMap({ className = '' }: { className?: string }) {
  const { data } = useApi<{ days: WeekDay[] }>('/dashboard/week');
  const [selected, setSelected] = useState<string | null>(null);
  const days = data?.days || [];

  if (!days.length) {
    return (
      <div className={`rounded-card border border-dashed border-line bg-card/40 p-5 text-center text-sm text-ink-faint ${className}`}>
        أسبوعك سيظهر هنا كرحلة بصرية.
      </div>
    );
  }

  const selectedDay = days.find((d) => d.date === selected) || null;

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-1.5" role="list" aria-label="آخر 7 أيام">
        {days.map((d) => {
          const active = selected === d.date;
          const pct = d.quality / 7;
          const size = 26 + Math.round(pct * 20);
          const color = pct >= 0.7 ? 'rgb(var(--brand-accent))' : pct >= 0.4 ? 'rgb(var(--brand))' : 'rgb(var(--line))';
          return (
            <button
              key={d.date}
              type="button"
              role="listitem"
              onClick={() => setSelected(active ? null : d.date)}
              aria-label={`${dayName(d.date)} — جودة ${Math.round(pct * 100)}%`}
              aria-pressed={active}
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-1 transition hover:bg-brand-soft/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span className="text-[10px] font-semibold text-ink-faint">{dayName(d.date)}</span>
              <span
                className="grid place-items-center rounded-full transition-all duration-300"
                style={{ width: size, height: size, background: color, boxShadow: active ? `0 0 0 3px rgb(var(--brand) / 0.25), 0 0 14px -2px ${color}` : 'none' }}
              >
                <span className="text-[11px] font-extrabold text-white">{d.quality}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-3 animate-fadeIn rounded-xl border border-line bg-elevated/70 p-3 text-sm" aria-live="polite">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-bold text-ink">
              {dayName(selectedDay.date)} <span className="text-ink-faint">— {selectedDay.date}</span>
            </p>
            <span className="chip">{MOOD_LABEL[selectedDay.mood || ''] || 'بدون مزاج'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span>✓ مهام: {selectedDay.tasksDone ?? 0}</span>
            <span>⏱ تركيز: {selectedDay.focusMinutes ?? 0} دقيقة</span>
            <span>✧ امتنان: {selectedDay.gratitude ?? 0}</span>
            <span>حالة: {selectedDay.checkin ? `طاقة ${selectedDay.energy ?? '—'}` : 'غير مسجلة'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
