import { useState } from 'react';
import { Dices } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui';
import { celebrate } from '../visualizations/CompletionBurst';
import { playSuccess } from '../../lib/sound';
import type { Surprise } from '../../lib/progress';

const TYPE_ICON: Record<string, string> = {
  reflection: '💭', challenge: '🎯', idea: '💡', calm: '🌙', checkin: '🫀',
};

export default function SurpriseButton({ label = true, className = '' }: { label?: boolean; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Surprise | null>(null);
  const [revealing, setRevealing] = useState(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const s = await api.post<Surprise>('/surprise');
      setResult(s);
      setRevealing(true);
      playSuccess();
      celebrate({ text: s.title });
      window.setTimeout(() => setRevealing(false), 900);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="ghost" className={className} onClick={run} disabled={loading} title="فاجئني">
        <Dices className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {label ? 'فاجئني' : ''}
      </Button>

      {result && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="فاجئني">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResult(null)} />
          <div className="card relative z-10 w-full max-w-sm animate-riseIn bg-card p-6 text-center" style={{ animation: revealing ? 'cinematicRise 0.9s ease-out both' : undefined }}>
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-accent via-brand to-brand-dark text-3xl shadow-button">
              {TYPE_ICON[result.type] || '🎲'}
            </span>
            <h3 className="text-xl font-extrabold text-ink">{result.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{result.text}</p>
            <div className="mt-4 flex justify-center gap-2">
              {result.action?.route && (
                <a href={`#${result.action.route}`} onClick={() => setResult(null)} className="btn-primary !px-4 !py-2 text-sm">
                  {result.actionLabel || 'افتح'}
                </a>
              )}
              <Button variant="ghost" onClick={() => setResult(null)}>مغلق</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
