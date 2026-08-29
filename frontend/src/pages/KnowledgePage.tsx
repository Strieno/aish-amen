import { useRef, useState } from 'react';
import { FileText, Library, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { KnowledgeBase, RagResult } from '../lib/types';
import { Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';

export default function KnowledgePage() {
  const t = useT();
  const { data: bases, loading, refetch } = useApi<KnowledgeBase[]>('/knowledge');
  const [showAdd, setShowAdd] = useState(false);
  const [baseName, setBaseName] = useState('');
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RagResult[]>([]);
  const [searched, setSearched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importTarget, setImportTarget] = useState<string>('');

  const addBase = async () => {
    if (!baseName.trim()) return;
    await api.post('/knowledge', { name: baseName.trim() });
    setBaseName('');
    setShowAdd(false);
    refetch();
  };

  const importFile = async (file: File) => {
    if (!importTarget) return;
    setImporting(true);
    try {
      const text = await file.text().catch(() => '');
      await api.post('/knowledge/import', { kb_id: importTarget, filename: file.name, content: text });
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    const r = await api.get<RagResult[]>(`/knowledge/search?q=${encodeURIComponent(query)}`);
    setResults(r);
    setSearched(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="section-title">{t('knowledge.title')}</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t('knowledge.addBase')}
        </Button>
      </div>

      {/* Search */}
      <Card>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint rtl:right-3 ltr:left-3" />
            <input className="input ps-9" placeholder={t('knowledge.search')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          </div>
          <Button onClick={search}>{t('common.search')}</Button>
        </div>
        {results.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-bold text-ink-faint">{t('knowledge.citations')}</p>
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.chunk_id} className="rounded-xl bg-elevated p-3">
                  <p className="mb-1 flex items-center gap-2 text-xs font-bold text-brand-dark">
                    <FileText className="h-3.5 w-3.5" /> {r.filename}
                    <span className="text-ink-faint">• {t('knowledge.citations')} p.{r.page}</span>
                  </p>
                  <p className="text-sm leading-relaxed text-ink-soft">{r.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {searched && results.length === 0 && <p className="mt-3 text-sm text-ink-faint">{t('common.none')}</p>}
      </Card>

      {/* Bases */}
      {loading ? (
        <Spinner className="mx-auto mt-6 block h-6 w-6" />
      ) : (bases || []).length === 0 ? (
        <EmptyState text={t('knowledge.noBases')} />
      ) : (
        (bases || []).map((kb) => {
          const documents = Array.isArray(kb.documents) ? kb.documents : [];
          return <Card key={kb.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-brand-dark" />
                <h2 className="font-bold text-ink">{kb.name}</h2>
                <Badge tone="neutral">{documents.length} {t('knowledge.documents')}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setImportTarget(kb.id); fileRef.current?.click(); }} className="btn-icon !h-8 !w-8" title={t('knowledge.import')}>
                  <Upload className="h-4 w-4" />
                </button>
                <button onClick={async () => { await api.del(`/knowledge/${kb.id}`); refetch(); }} className="btn-icon !h-8 !w-8" title={t('common.delete')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-ink-faint">{t('common.none')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.filename}</span>
                    <Badge tone={d.status === 'ready' ? 'ok' : 'neutral'}>{d.status}</Badge>
                    <span className="text-xs text-ink-faint">{d.chunks ?? 0} {t('knowledge.chunks')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>;
        })
      )}

      <input ref={fileRef} type="file" accept=".txt,.md,.json,.csv,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('knowledge.addBase')}>
        <div className="space-y-3">
          <Field label={t('common.name')}><input className="input" value={baseName} onChange={(e) => setBaseName(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
            <Button onClick={addBase}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Card className="flex items-center gap-3">
            <Spinner className="h-5 w-5" /> {t('knowledge.importing')}
          </Card>
        </div>
      )}
    </div>
  );
}
