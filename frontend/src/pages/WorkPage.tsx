import { useState } from 'react';
import { CalendarPlus, FileText, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { WorkNote, WorkShift } from '../lib/types';
import { PageHeader, Button, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';

export default function WorkPage() {
  const t = useT();
  const { data: shifts, loading: l1, refetch: r1 } = useApi<WorkShift[]>('/work/shifts');
  const { data: notes, loading: l2, refetch: r2 } = useApi<WorkNote[]>('/work/notes');
  const [showShift, setShowShift] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [start, setStart] = useState('');
  const [role, setRole] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  return (
    <div className="space-y-4">
      <PageHeader title={t('work.title')} />

      {/* Shifts */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">{t('work.shifts')}</h2>
          <Button variant="ghost" onClick={() => setShowShift(true)} className="!px-3 !py-1.5 text-xs">
            <CalendarPlus className="h-4 w-4" /> {t('work.addShift')}
          </Button>
        </div>
        {l1 ? (
          <Spinner className="h-5 w-5" />
        ) : (shifts || []).length === 0 ? (
          <EmptyState text={t('work.noShifts')} />
        ) : (
          <Card className="!p-3">
            <ul className="divide-y divide-line">
              {(shifts || []).map((s) => (
                <li key={s.id} className="group flex items-center gap-3 px-2 py-2.5">
                  <span className="w-24 shrink-0 text-sm font-bold text-brand-dark">
                    {s.shift_start.slice(0, 16).replace('T', ' ')}
                  </span>
                  <span className="text-sm text-ink">{s.role || t('work.role')}</span>
                  {s.notes && <span className="truncate text-xs text-ink-faint">{s.notes}</span>}
                  <button
                    onClick={async () => { await api.del(`/work/shifts/${s.id}`); r1(); }}
                    className="btn-icon ms-auto !h-7 !w-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Notes */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">{t('work.notes')}</h2>
          <Button variant="ghost" onClick={() => setShowNote(true)} className="!px-3 !py-1.5 text-xs">
            <FileText className="h-4 w-4" /> {t('work.addNote')}
          </Button>
        </div>
        {l2 ? (
          <Spinner className="h-5 w-5" />
        ) : (notes || []).length === 0 ? (
          <EmptyState text={t('work.noNotes')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(notes || []).map((n) => (
              <Card key={n.id} className="!p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-bold text-ink">{n.title}</h3>
                  <button
                    onClick={async () => { await api.del(`/work/notes/${n.id}`); r2(); }}
                    className="btn-icon !h-7 !w-7"
                    aria-label={`${t('common.delete')}: ${n.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{n.content}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showShift} onClose={() => setShowShift(false)} title={t('work.addShift')}>
        <div className="space-y-3">
          <Field label={t('work.start')}><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={t('work.role')}><input className="input" value={role} onChange={(e) => setRole(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowShift(false)}>{t('common.cancel')}</Button>
            <Button onClick={async () => { await api.post('/work/shifts', { shift_start: start || new Date().toISOString(), role: role || null }); setShowShift(false); r1(); }}>
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showNote} onClose={() => setShowNote(false)} title={t('work.addNote')}>
        <div className="space-y-3">
          <Field label={t('common.title')}><input className="input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></Field>
          <Field label={t('common.notes')}><textarea className="input" rows={4} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNote(false)}>{t('common.cancel')}</Button>
            <Button onClick={async () => { await api.post('/work/notes', { title: noteTitle, content: noteContent }); setNoteTitle(''); setNoteContent(''); setShowNote(false); r2(); }}>
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
