import { useState } from 'react';
import { Brain, Pin, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Memory } from '../lib/types';
import { PageHeader, Badge, Button, Card, EmptyState, Field, Modal, Spinner, Toggle } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import { MemoryConstellation } from '../components/visualizations';

const SOURCES = ['all', 'user', 'chat', 'task', 'journal', 'checkin', 'milestone', 'focus', 'exam', 'safe-plan', 'work-note'];

export default function MemoryPage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [content, setContent] = useState('');
  const [memType, setMemType] = useState('preference');
  const [importance, setImportance] = useState('0.5');
  const suggest = useAiAction('memory-suggest');
  const [savedCandidates, setSavedCandidates] = useState<Set<string>>(new Set());
  const [harvestMsg, setHarvestMsg] = useState('');
  const [harvesting, setHarvesting] = useState(false);

  const url =
    `/memory?limit=200` +
    (type ? `&type=${type}` : '') +
    (source !== 'all' ? `&source=${source}` : '') +
    (query ? `&q=${encodeURIComponent(query)}` : '');
  const { data, loading, refetch } = useApi<Memory[]>(url, [query, type, source]);

  const add = async () => {
    if (!content.trim()) return;
    await api.post('/memory', { content, type: memType, importance: Number(importance), source: 'user', tags: [] });
    setContent('');
    setShowAdd(false);
    refetch();
  };

  const forget = async (m: Memory) => {
    await api.del(`/memory/${m.id}`);
    refetch();
  };
  const togglePin = async (m: Memory) => {
    await api.put(`/memory/${m.id}`, { pinned: !m.pinned });
    refetch();
  };
  const toggleAccess = async (m: Memory) => {
    await api.put(`/memory/${m.id}`, { ai_access: !m.ai_access });
    refetch();
  };

  const harvest = async () => {
    setHarvesting(true);
    setHarvestMsg('');
    try {
      const r = await api.post<{ added: number }>('/memory/harvest');
      setHarvestMsg(`${r.added} ${t('memory.harvestDone')}`);
      refetch();
    } catch {
      setHarvestMsg('');
    } finally {
      setHarvesting(false);
    }
  };

  const deleteAll = async () => {
    if (window.confirm(t('memory.confirmDeleteAll'))) {
      await api.del('/memory');
      refetch();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('memory.title')}>
        <Button variant="ghost" onClick={harvest} disabled={harvesting} className="!px-3 !py-2 text-xs" title={t('memory.harvestHint')}>
          {harvesting ? <Spinner className="h-4 w-4" /> : <Brain className="h-4 w-4" />} {t('memory.harvest')}
        </Button>
        <Button variant="ghost" onClick={() => suggest.run()} disabled={suggest.loading} className="!px-3 !py-2 text-xs">
          {suggest.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('ai.suggestMemories')}
        </Button>
        <Button variant="danger" onClick={deleteAll} className="!px-3 !py-2 text-xs">
          <Trash2 className="h-4 w-4" /> {t('memory.deleteAll')}
        </Button>
        <Button onClick={() => setShowAdd(true)} className="!px-3 !py-2 text-xs">
          <Plus className="h-4 w-4" /> {t('memory.add')}
        </Button>
      </PageHeader>

      {harvestMsg && <p className="text-sm font-bold text-ok">✓ {harvestMsg}</p>}

      {/* Search + source filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint rtl:right-3 ltr:left-3" />
          <input className="input ps-9" placeholder={t('memory.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input !w-36" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('memory.types')}>
          <option value="">{t('memory.types')}: {t('memory.all')}</option>
          {['preference', 'general', 'ai', 'episodic', 'semantic', 'project'].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <p className="w-full text-[11px] font-bold text-ink-faint">{t('memory.sources')}</p>
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`chip cursor-pointer ${source === s ? 'bg-brand text-white' : ''}`}
          >
            {t(`memory.source${s === 'all' ? 's' : s === 'safe-plan' ? 'Safe' : s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* AI candidates */}
      {suggest.result?.candidates && suggest.result.candidates.length > 0 && (
        <Card className="!border-brand-lighter">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <Sparkles className="h-4 w-4 text-brand-dark" /> {t('ai.candidates')}
          </p>
          <div className="space-y-2">
            {suggest.result.candidates.map((c, i) => {
              const key = `${i}-${c.content}`;
              const saved = savedCandidates.has(key);
              return (
                <div key={key} className="flex items-start gap-2 rounded-xl bg-elevated p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{c.content}</p>
                    <Badge tone="brand">{c.type}</Badge>
                  </div>
                  {saved ? (
                    <span className="text-xs font-bold text-ok">✓ {t('ai.savedMem')}</span>
                  ) : (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        className="!px-2.5 !py-1 text-xs"
                        onClick={async () => {
                          const r = await api.post<{ ok: boolean }>('/ai/action', { action: 'memory-save', candidate: c });
                          if (r.ok) {
                            setSavedCandidates(new Set(savedCandidates).add(key));
                            refetch();
                          }
                        }}
                      >
                        {t('ai.save')}
                      </Button>
                      <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => setSavedCandidates(new Set(savedCandidates).add(key))}>
                        {t('ai.ignore')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <Spinner className="mx-auto mt-8 block h-6 w-6" />
      ) : (data || []).length === 0 ? (
        <EmptyState text={t('memory.noMemories')} action={
          <div className="flex justify-center gap-2">
            <Button variant="ghost" onClick={harvest} disabled={harvesting} className="text-xs">
              <Brain className="h-4 w-4" /> {t('memory.harvest')}
            </Button>
            <Button variant="ghost" onClick={() => setShowAdd(true)} className="text-xs">
              <Plus className="h-4 w-4" /> {t('memory.add')}
            </Button>
          </div>
        } />
      ) : (
        <>
          <Card className="relative overflow-hidden !py-4">
            <div className="mb-1 flex items-center gap-2 text-brand-dark">
              <Brain className="h-4 w-4" />
              <h2 className="text-sm font-bold">{t('graph.title')}</h2>
            </div>
            <MemoryConstellation memories={data || []} />
          </Card>
          <div className="space-y-2">
            {(data || []).map((m) => (
              <Card key={m.id} className="!p-4">
                <div className="flex items-start gap-3">
                <Brain className="mt-1 h-4 w-4 shrink-0 text-brand-dark" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-ink">{m.content}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{m.type}</Badge>
                    {m.source_type && (
                      <Badge tone="neutral">
                        {t(`memory.source${m.source_type === 'safe-plan' ? 'Safe' : m.source_type === 'work-note' ? 'Work' : m.source_type.charAt(0).toUpperCase() + m.source_type.slice(1)}`)}
                      </Badge>
                    )}
                    {m.importance > 0.7 && <Badge tone="warn">★ {m.importance.toFixed(1)}</Badge>}
                    <span className="text-xs text-ink-faint">{m.updated_at?.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => togglePin(m)} className={`btn-icon !h-8 !w-8 ${m.pinned ? '!text-brand-dark' : ''}`} title={m.pinned ? t('memory.unpin') : t('memory.pin')}>
                    <Pin className="h-4 w-4" />
                  </button>
                  <Toggle checked={m.ai_access} onChange={() => toggleAccess(m)} label={t('memory.aiOnly')} />
                  <button onClick={() => forget(m)} className="btn-icon !h-8 !w-8" title={t('memory.forget')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
          </div>
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('memory.add')}>
        <div className="space-y-3">
          <Field label="محتوى الذكرى">
            <textarea className="input" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('memory.types')}>
              <select className="input" value={memType} onChange={(e) => setMemType(e.target.value)}>
                {['preference', 'general', 'episodic', 'semantic', 'project'].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="الأهمية">
              <input type="range" min="0" max="1" step="0.1" value={importance} onChange={(e) => setImportance(e.target.value)} className="w-full" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
            <Button onClick={add}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
