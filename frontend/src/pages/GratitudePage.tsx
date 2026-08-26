import { useState } from 'react';
import { Heart, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { Button, Card, EmptyState, Spinner } from '../components/ui';

interface GratitudeRow {
  id: string;
  items: string[];
  entry_date: string;
}

export default function GratitudePage() {
  const t = useT();
  const { data, loading, refetch } = useApi<GratitudeRow[]>('/gratitude');
  const [items, setItems] = useState<string[]>(['', '', '']);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const list = items.map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    await api.post('/gratitude', { items: list });
    setItems(['', '', '']);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    refetch();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title">{t('gratitude.title')}</h1>
        <p className="text-sm text-ink-faint">{t('gratitude.subtitle')}</p>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-brand-dark">
          <Heart className="h-4 w-4" />
          <h2 className="text-sm font-bold">{t('gratitude.entry')}</h2>
          {saved && <span className="ms-auto text-xs font-bold text-ok">✓ {t('common.saved')}</span>}
        </div>
        <div className="space-y-2">
          {items.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">
                {i + 1}
              </span>
              <input
                className="input"
                placeholder={`${t('gratitude.placeholder')} ${i + 1}`}
                value={val}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={save} disabled={!items.some((x) => x.trim())}>
          <Plus className="h-4 w-4" /> {t('gratitude.add')}
        </Button>
      </Card>

      {loading ? (
        <Spinner className="mx-auto mt-6 block h-6 w-6" />
      ) : (data || []).length === 0 ? (
        <EmptyState text={t('gratitude.empty')} />
      ) : (
        <div className="space-y-3">
          {(data || []).map((row) => (
            <Card key={row.id} className="!p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-bold text-ink-faint">{row.entry_date}</p>
                <button
                  onClick={async () => {
                    await api.del(`/gratitude/${row.id}`);
                    refetch();
                  }}
                  className="btn-icon !h-7 !w-7"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-1">
                {row.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <span className="mt-0.5 text-brand-dark">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
