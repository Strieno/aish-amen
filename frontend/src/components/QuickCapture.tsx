import { useEffect, useState } from 'react';
import { BookOpen, Check, Heart, ListTodo } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Button, Field, Modal, Select, Spinner } from './ui';
import VoiceInputButton from './VoiceInputButton';

type CaptureType = 'task' | 'journal' | 'gratitude';

export default function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [type, setType] = useState<CaptureType>('task');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setError('');
  }, [open]);

  const resetAndClose = () => {
    setText('');
    setTitle('');
    setPriority('medium');
    setDueDate('');
    setSaved(false);
    setError('');
    onClose();
  };

  const save = async () => {
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    setError('');
    try {
      if (type === 'task') {
        await api.post('/tasks', {
          title: content,
          priority,
          energy: 'medium',
          status: 'inbox',
          due_date: dueDate || null,
        });
      } else if (type === 'journal') {
        await api.post('/journal', {
          title: title.trim() || content.slice(0, 50),
          content,
          entry_date: new Date().toISOString().slice(0, 10),
          tags: [],
          mood: null,
          ai_access: true,
        });
      } else {
        const items = content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
        await api.post('/gratitude', { items });
      }
      setSaved(true);
      window.dispatchEvent(new CustomEvent('aish:quick-captured', { detail: { type } }));
      window.setTimeout(resetAndClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('quickCapture.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={resetAndClose} title={t('quickCapture.title')}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Button variant={type === 'task' ? 'primary' : 'ghost'} onClick={() => setType('task')}>
            <ListTodo className="h-4 w-4" /> {t('quickCapture.task')}
          </Button>
          <Button variant={type === 'journal' ? 'primary' : 'ghost'} onClick={() => setType('journal')}>
            <BookOpen className="h-4 w-4" /> {t('quickCapture.journal')}
          </Button>
          <Button variant={type === 'gratitude' ? 'primary' : 'ghost'} onClick={() => setType('gratitude')}>
            <Heart className="h-4 w-4" /> {t('quickCapture.gratitude')}
          </Button>
        </div>

        {type === 'journal' && (
          <Field label={t('common.title')}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('common.optional')} />
          </Field>
        )}

        <Field label={type === 'task' ? t('quickCapture.taskPrompt') : type === 'journal' ? t('quickCapture.journalPrompt') : t('quickCapture.gratitudePrompt')}>
          <textarea
            autoFocus
            className="input min-h-28 resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={type === 'gratitude' ? t('quickCapture.gratitudeHint') : undefined}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <VoiceInputButton onFinal={(txt) => setText((v) => (v ? `${v}\n` : '') + txt)} />
            <span className="text-[11px] text-ink-faint">{t('chat.mic')}</span>
          </div>
        </Field>

        {type === 'task' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.priority')}>
              <Select value={priority} onChange={setPriority}>
                <option value="low">{t('common.low')}</option>
                <option value="medium">{t('common.medium')}</option>
                <option value="high">{t('common.high')}</option>
              </Select>
            </Field>
            <Field label={t('common.date')}>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        )}

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        {saved && <p className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm font-bold text-ok"><Check className="h-4 w-4" /> {t('common.saved')}</p>}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-[11px] text-ink-faint">Ctrl + Enter</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={resetAndClose}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!text.trim() || saving || saved}>
              {saving && <Spinner className="h-4 w-4" />} {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
