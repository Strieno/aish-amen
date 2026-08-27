import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { api } from '../../lib/api';
import type { Discovery } from '../../lib/progress';

const ICONS: Record<string, string> = { moon: '🌙', heart: '💚', brain: '🧠', clock: '🕐', flag: '🚩' };

/** Cross-domain discoveries — "كيف عرف التطبيق هذا؟" */
export default function DiscoveriesCard({ className = '' }: { className?: string }) {
  const [items, setItems] = useState<Discovery[] | null>(null);

  useEffect(() => {
    api.get<{ discoveries: Discovery[] }>('/insights/discover').then((r) => setItems(r.discoveries)).catch(() => setItems(null));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className={`card p-5 ${className}`}>
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <Lightbulb className="h-4 w-4 text-brand-dark" /> اكتشافات
      </p>
      <ul className="space-y-3">
        {items.slice(0, 2).map((d) => (
          <li key={d.key} className="flex gap-3">
            <span className="text-lg" aria-hidden="true">{ICONS[d.icon] || '✨'}</span>
            <div>
              <p className="text-sm font-bold text-ink">{d.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{d.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
