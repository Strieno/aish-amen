import { useState } from 'react';
import { Link, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { entityIcon, RELATIONSHIP_LABELS } from '../lib/entity-utils';
import type { LinkSuggestion, RelatedEntity } from '../lib/types';
import { Button, Spinner } from './ui';
import EntityChip from './EntityChip';

interface RelatedResponse {
  type: string;
  id: string;
  related: RelatedEntity[];
  suggestions: LinkSuggestion[];
}

/**
 * "مرتبط بـ" — related-content section for any entity detail view.
 * Shows linked entities as cards with relationship info, one-click
 * navigation, provenance ("why"), and pending link suggestions.
 */
export default function RelatedPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const t = useT();
  const { data, loading, refetch } = useApi<RelatedResponse>(`/related/${entityType}/${entityId}`, [entityType, entityId]);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const discover = async () => {
    setDiscovering(true);
    try {
      await api.post('/links/discover', { type: entityType, id: entityId });
      refetch();
    } finally {
      setDiscovering(false);
    }
  };

  const accept = async (s: LinkSuggestion) => {
    await api.post(`/links/suggestions/${s.id}/accept`);
    refetch();
  };
  const reject = async (s: LinkSuggestion) => {
    await api.post(`/links/suggestions/${s.id}/reject`);
    refetch();
  };

  if (loading) return <Spinner className="mx-auto block h-5 w-5" />;

  const related = data?.related || [];
  const suggestions = data?.suggestions || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Link className="h-4 w-4 text-brand-dark" /> {t('related.title')}
        </h3>
        <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={discover} disabled={discovering}>
          {discovering ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {t('related.discover')}
        </Button>
      </div>

      {related.length === 0 && suggestions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-ink-faint">
          {t('related.empty')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {related.map((r) => (
            <div key={r.link_id} className="relative">
              <EntityChip type={r.type} id={r.id} title={r.title} />
              <button
                onClick={() => setWhyOpen(whyOpen === r.link_id ? null : r.link_id)}
                className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] text-white"
                title={t('related.why')}
              >
                ?
              </button>
              {whyOpen === r.link_id && (
                <div className="absolute start-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-card p-2.5 shadow-card-hover animate-fadeIn">
                  <p className="text-xs font-bold text-ink">{t('related.why')}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t(`graph.relations`)}: {RELATIONSHIP_LABELS[r.relationship_type] || r.relationship_type}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {t('graph.confidence')}: {Math.round(r.confidence * 100)}% · {r.created_by === 'auto' ? 'تلقائي' : r.created_by === 'user' ? 'يدوي' : r.created_by}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-brand-lighter bg-brand-soft/50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
            <Sparkles className="h-3.5 w-3.5 text-brand-dark" /> {t('related.suggestion')}
          </p>
          <div className="space-y-2">
            {suggestions.map((s) => {
              const Icon = entityIcon(s.target_type);
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-brand-dark" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.target_title || s.target_id}</p>
                    {s.reason && <p className="truncate text-[11px] text-ink-faint">{s.reason}</p>}
                  </div>
                  <span className="text-[10px] text-ink-faint">{Math.round(s.confidence * 100)}%</span>
                  <div className="flex shrink-0 gap-1">
                    <Button className="!px-2 !py-0.5 text-[11px]" onClick={() => accept(s)}>{t('related.accept')}</Button>
                    <Button variant="ghost" className="!px-2 !py-0.5 text-[11px]" onClick={() => reject(s)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
