import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import type { JournalEntry } from '../lib/types';
import { PageHeader, Button, Card, EmptyState, Spinner, Toggle } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';
import RelatedPanel from '../components/RelatedPanel';
import { localDateKey } from '../lib/date';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function JournalPage() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const [params, setParams] = useSearchParams();
  const { data: entries, loading, refetch } = useApi<JournalEntry[]>('/journal');

  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [draft, setDraft] = useState<{ title: string; content: string; entry_date: string; tags: string[]; mood: string; ai_access: boolean } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const saveTimer = useRef<number | null>(null);
  const summary = useAiAction('journal-summary');

  // Refs always hold the LATEST values so debounced saves never act on
  // stale render closures (prevents duplicate POSTs and lost updates).
  const draftRef = useRef(draft);
  const selectedRef = useRef<JournalEntry | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const today = localDateKey();

  /** Persist the draft without touching React state (safe on unmount). */
  const persistRaw = useCallback(async (d: NonNullable<typeof draftRef.current>, sel: JournalEntry | null) => {
    const patch = { title: d.title, content: d.content, entry_date: d.entry_date, tags: d.tags, mood: d.mood || null, ai_access: d.ai_access };
    if (sel) {
      const updated = await api.put<JournalEntry>(`/journal/${sel.id}`, patch);
      return updated;
    }
    const created = await api.post<JournalEntry>('/journal', patch);
    return created;
  }, []);

  /** Immediate save of the current draft (manual button, blur, switch). */
  const saveNow = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    if (!d.title.trim() && !d.content.trim()) {
      setSaveState('idle');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const saved = await persistRaw(d, selectedRef.current);
      if (!selectedRef.current) {
        // New entry: adopt the created row so future saves update it.
        selectedRef.current = saved;
        setSelected(saved);
        refetch();
      }
      setSaveState('saved');
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setSaveState('error');
      setSaveError(e instanceof Error ? e.message : 'save failed');
    }
  }, [persistRaw, refetch]);

  // Debounced autosave on every draft change.
  useEffect(() => {
    if (!draft) return;
    if (draft.title.trim() || draft.content.trim()) setSaveState('idle');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveNow();
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, saveNow]);

  // Flush pending edits on unmount / tab close so nothing is ever lost.
  useEffect(() => {
    const flush = () => {
      const d = draftRef.current;
      if (d && (d.title.trim() || d.content.trim())) {
        persistRaw(d, selectedRef.current).catch(() => {});
      }
    };
    const onPageHide = () => flush();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get('new') === '1') {
      const preTitle = params.get('title') || '';
      const preContent = params.get('content') || '';
      setSelected(null);
      selectedRef.current = null;
      setDraft({ title: preTitle, content: preContent, entry_date: today, tags: [], mood: '', ai_access: true });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newEntry = () => {
    saveNow(); // persist whatever is open before switching
    setSelected(null);
    selectedRef.current = null;
    setDraft({ title: '', content: '', entry_date: today, tags: [], mood: '', ai_access: true });
    setSaveState('idle');
  };

  const openEntry = (e: JournalEntry) => {
    if (selectedRef.current?.id === e.id) return;
    saveNow(); // persist pending edits of the previous entry before switching
    setSelected(e);
    selectedRef.current = e;
    setDraft({ title: e.title, content: e.content, entry_date: e.entry_date, tags: e.tags, mood: e.mood || '', ai_access: e.ai_access });
    setSaveState('idle');
  };

  const remove = async (e: JournalEntry) => {
    await api.del(`/journal/${e.id}`);
    if (selected?.id === e.id) {
      setSelected(null);
      selectedRef.current = null;
      setDraft(null);
      draftRef.current = null;
    }
    refetch();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('journal.title')}>
        <Button onClick={newEntry}>
          <Plus className="h-4 w-4" /> {t('journal.newEntry')}
        </Button>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        {/* List */}
        <div className="space-y-1">
          {loading ? (
            <Spinner className="mx-auto mt-6 block h-6 w-6" />
          ) : (entries || []).length === 0 ? (
            <EmptyState text={t('journal.empty')} />
          ) : (
            (entries || []).map((e) => (
              <button
                key={e.id}
                onClick={() => openEntry(e)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition ${
                  selected?.id === e.id ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-elevated'
                }`}
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.title || '…'}</span>
                  <span className="block text-xs text-ink-faint">{e.entry_date}</span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        <Card className="min-h-[50vh]">
          {!draft ? (
            <EmptyState text={t('journal.empty')} action={<Button onClick={newEntry}>{t('journal.newEntry')}</Button>} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="input !border-0 !px-1 !py-1 text-xl font-extrabold focus:ring-0"
                  placeholder={lang === 'en' ? 'Title' : 'العنوان'}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    onBlur={saveNow}
                />
                <input
                  type="date"
                  className="input !w-auto"
                  value={draft.entry_date}
                  onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })}
                  onBlur={saveNow}
                />
                <span className={`ms-auto flex items-center gap-2 text-xs font-semibold ${
                  saveState === 'saved' ? 'text-ok' : saveState === 'error' ? 'text-danger' : saveState === 'saving' ? 'text-ink-faint' : 'text-ink-faint'
                }`}>
                  {saveState === 'saving' && <Spinner className="h-3.5 w-3.5" />}
                  {saveState === 'saving' && t('common.loading')}
                  {saveState === 'saved' && `✓ ${t('journal.saved')}`}
                  {saveState === 'error' && `✕ ${t('ai.error')}`}
                </span>
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={saveNow} disabled={saveState === 'saving'}>
                  <Save className="h-3.5 w-3.5" /> {t('common.save')}
                </Button>
              </div>
              {saveState === 'error' && saveError && (
                <p className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger">
                  {saveError} — <button className="font-bold underline" onClick={saveNow}>{t('common.retry')}</button>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <Toggle checked={draft.ai_access} onChange={(v) => setDraft({ ...draft, ai_access: v })} label={t('journal.allowAi')} />
                  {t('journal.allowAi')}
                </label>
                <input
                  className="input !w-44 !py-1.5 text-sm"
                  placeholder={t('common.mood') || 'المزاج'}
                  value={draft.mood}
                  onChange={(e) => setDraft({ ...draft, mood: e.target.value })}
                  onBlur={saveNow}
                />
                <input
                  className="input !w-48 !py-1.5 text-sm"
                  placeholder={t('common.tags')}
                  value={draft.tags.join(', ')}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                  onBlur={saveNow}
                />
              </div>
              <textarea
                className="input min-h-[300px] !border-0 !px-1 font-normal leading-relaxed focus:ring-0"
                placeholder={t('journal.placeholder')}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                onBlur={saveNow}
              />
              {selected && (
                <div className="border-t border-line pt-3">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      className="!px-3 !py-1.5 text-xs"
                      disabled={summary.loading || !selected.ai_access}
                      title={!selected.ai_access ? t('journal.allowAi') : ''}
                      onClick={() => summary.run({ journal_id: selected.id })}
                    >
                      {summary.loading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {t('ai.summarize')}
                    </Button>
                    <Button variant="danger" onClick={() => remove(selected)}>
                      <Trash2 className="h-4 w-4" /> {t('common.delete')}
                    </Button>
                  </div>
                  <AiResultBox loading={summary.loading} result={summary.result} compact />
                </div>
              )}
              {selected && (
                <div className="border-t border-line pt-3">
                  <RelatedPanel entityType="journal" entityId={selected.id} />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
