import { useMemo, useState } from 'react';
import { Battery, HeartPulse, Moon, Save, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import { localDateKey } from '../lib/date';
import { Button, Card, Spinner } from './ui';
import type { Checkin } from '../lib/types';

const RATING_LABELS = ['', 'ضعيف', 'منخفض', 'متوسط', 'جيد', 'ممتاز'];
const STRESS_LABELS = ['', 'هادئ جداً', 'خفيف', 'متوسط', 'مرتفع', 'شديد'];

/** Deterministic, non-medical daily organization suggestions from the check-in. */
function suggestionsFor(energy: number, stress: number, sleep: number, lang: 'ar' | 'en'): string[] {
  const out: string[] = [];
  if (energy <= 2) out.push(lang === 'ar' ? 'طاقة منخفضة اليوم — قلل عدد المهام واختر مهمة أساسية واحدة فقط.' : 'Low energy today — cut the task list and pick one essential task.');
  if (stress >= 4) out.push(lang === 'ar' ? 'توتر مرتفع — خذ خطوة هادئة واحدة صغيرة، وافعل أقل اليوم.' : 'High stress — take one small calm step and do less today.');
  if (sleep <= 2) out.push(lang === 'ar' ? 'نوم غير كافٍ — ابدأ اليوم بلطف واجعل الجلسات قصيرة.' : 'Short sleep — start gently and keep sessions short.');
  if (energy <= 2 && stress <= 2) out.push(lang === 'ar' ? 'رغم الطاقة المنخفضة، مزاجك مستقر — جرّب جلسة تركيز قصيرة 15 دقيقة.' : 'Low energy but calm mood — try a 15-minute focus session.');
  if (energy >= 4 && stress <= 2) out.push(lang === 'ar' ? 'حالتك اليوم ممتازة — يوم مثالي لإنجاز أهم مهمة.' : 'You feel great today — a perfect day to finish your top task.');
  if (energy >= 3 && stress <= 3 && sleep >= 3 && out.length === 0) {
    out.push(lang === 'ar' ? 'اليوم مستقر — يمكنك إضافة جلسة دراسة قصيرة بهدوء.' : 'Today feels stable — a short study session is a good fit.');
  }
  return out.slice(0, 2);
}

function fillPercent(value: number): React.CSSProperties {
  return { ['--fill' as string]: `${((value - 1) / 4) * 100}%` };
}

function RatingRow({
  label,
  icon: Icon,
  value,
  onChange,
  sub,
  labels,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
  sub: string;
  labels: string[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-ink">
        <Icon className="h-3.5 w-3.5 text-brand-dark" />
        {label}
        <span className="ms-auto text-[11px] font-semibold text-brand-dark">{labels[value] || value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rating-slider"
        style={fillPercent(value)}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value}
      />
      <p className="text-[10px] text-ink-faint">{sub}</p>
    </div>
  );
}

export default function CheckinCard({ checkin, onSaved }: { checkin: Checkin | null; onSaved?: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language) === 'en' ? 'en' : 'ar';
  const [energy, setEnergy] = useState(checkin?.energy ?? 3);
  const [stress, setStress] = useState(checkin?.stress ?? 2);
  const [sleep, setSleep] = useState(Math.round(checkin?.sleep_hours ?? 3));
  const [note, setNote] = useState(checkin?.concern ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const suggestions = useMemo(() => suggestionsFor(energy, stress, sleep, lang), [energy, stress, sleep, lang]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/checkins/${localDateKey()}`, {
        energy,
        stress,
        sleep_hours: sleep,
        concern: note.trim() || '',
        success: checkin?.success ?? '',
      });
      setSaved(true);
      onSaved?.();
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-brand-lighter/60">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white" aria-hidden="true">
          <HeartPulse className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-extrabold text-ink">{t('checkin.title')}</h2>
        {checkin && (
          <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-dark">✓ {t('checkin.done')}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RatingRow label={t('checkin.energy')} icon={Battery} value={energy} onChange={setEnergy} sub="1–5" labels={RATING_LABELS} />
        <RatingRow label={t('checkin.stress')} icon={HeartPulse} value={stress} onChange={setStress} sub="1–5" labels={STRESS_LABELS} />
        <RatingRow label={t('checkin.sleep')} icon={Moon} value={sleep} onChange={setSleep} sub={t('checkin.sleepHint')} labels={RATING_LABELS} />
      </div>

      <textarea
        className="input mt-3 min-h-0 !resize-none !py-2 text-sm"
        rows={1}
        placeholder={t('checkin.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label={t('checkin.note')}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving} className="!px-3.5 !py-1.5 text-xs">
          {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} {t('checkin.save')}
        </Button>
        {saved && <span className="text-xs font-semibold text-brand-dark">✓ {t('checkin.done')}</span>}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 rounded-xl bg-brand-soft/60 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-brand-dark">
            <Sparkles className="h-3.5 w-3.5" /> {t('checkin.suggestions')}
          </p>
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-soft">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
