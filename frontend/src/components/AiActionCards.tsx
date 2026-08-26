import { useState } from 'react';
import { Check, GraduationCap, Heart, Pencil, ShieldCheck, Sparkles, Timer, X } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import type { AiProposal } from '../lib/types';
import { Button } from './ui';

const TYPE_ICON: Record<string, React.ElementType> = {
  task: Check,
  focus: Timer,
  goal: Heart,
  milestone: Heart,
  journal: Pencil,
  exam: GraduationCap,
  work_note: Pencil,
  memory: Sparkles,
  safe_action: ShieldCheck,
};

interface Executed {
  proposal: AiProposal;
  entity?: { type: string; id: string; title?: string };
  error?: string;
}

/**
 * Interactive AI action cards: the assistant proposes structured actions
 * (create task, start focus, save memory, ...) and the user approves,
 * edits, or dismisses each one individually.
 */
export default function AiActionCards({
  proposals,
  onExecute,
}: {
  proposals: AiProposal[];
  onExecute?: (p: AiProposal, ok: boolean) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState<AiProposal[]>(proposals);
  const [editing, setEditing] = useState<AiProposal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [executing, setExecuting] = useState<string | null>(null);
  const [executed, setExecuted] = useState<Record<string, Executed>>({});

  if (pending.length === 0 && Object.keys(executed).length === 0) return null;

  const execute = async (p: AiProposal) => {
    setExecuting(`${p.type}:${p.title}`);
    try {
      const r = await api.post<{ ok: boolean; entity?: { type: string; id: string; title?: string }; error?: string }>('/ai/execute', { proposal: p });
      setExecuted((e) => ({ ...e, [`${p.type}:${p.title}`]: { proposal: p, entity: r.entity, error: r.error } }));
      setPending((list) => list.filter((x) => x !== p));
      onExecute?.(p, !!r.ok);
    } catch (e) {
      setExecuted((s) => ({ ...s, [`${p.type}:${p.title}`]: { proposal: p, error: e instanceof Error ? e.message : 'error' } }));
    } finally {
      setExecuting(null);
    }
  };

  const dismiss = (p: AiProposal) => {
    setPending((list) => list.filter((x) => x !== p));
  };

  return (
    <div className="mt-2 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-ink-faint">
        <Sparkles className="h-3.5 w-3.5 text-brand-dark" /> {t('props.title')}
      </p>
      {pending.map((p, i) => {
        const key = `${p.type}:${p.title}`;
        const Icon = TYPE_ICON[p.type] || Sparkles;
        const busy = executing === key;
        return (
          <div key={`${key}-${i}`} className="rounded-xl border border-brand-lighter bg-brand-soft/40 p-3 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{p.title}</p>
                {p.reason && <p className="mt-0.5 text-xs text-ink-faint">{p.reason}</p>}
                <DataSummary proposal={p} />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => execute(p)} disabled={busy}>
                  {t('props.execute')}
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2.5 !py-1 text-[11px]"
                  onClick={() => {
                    setEditing(p);
                    setEditTitle(p.title);
                  }}
                >
                  {t('props.edit')}
                </Button>
                <Button variant="ghost" className="!px-2.5 !py-1 text-[11px]" onClick={() => dismiss(p)}>
                  <X className="h-3 w-3" /> {t('props.dismiss')}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      {Object.entries(executed).map(([key, ex]) => (
        <div
          key={key}
          className={`rounded-xl border p-3 text-sm ${
            ex.error ? 'border-danger-border bg-danger-bg text-danger' : 'border-line bg-elevated text-ink'
          }`}
        >
          {ex.error ? (
            <>✕ {ex.error}</>
          ) : (
            <>
              ✓ {t('props.done')}: {ex.entity?.title || ex.proposal.title}
            </>
          )}
        </div>
      ))}

      {editing && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-card p-2">
          <input className="input flex-1 !py-1.5 text-sm" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <Button
            className="!px-2.5 !py-1.5 text-xs"
            onClick={() => {
              if (editing) {
                const updated = { ...editing, title: editTitle.trim() || editing.title };
                setPending((list) => list.map((x) => (x === editing ? updated : x)));
              }
              setEditing(null);
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

function DataSummary({ proposal }: { proposal: AiProposal }) {
  const d = proposal.data || {};
  const parts: string[] = [];
  if (typeof d.due_date === 'string' && d.due_date) parts.push(`📅 ${d.due_date}`);
  if (typeof d.priority === 'string' && d.priority) parts.push(d.priority);
  if (typeof d.minutes === 'number' && d.minutes) parts.push(`⏱ ${d.minutes}د`);
  if (typeof d.life_area === 'string' && d.life_area) parts.push(d.life_area);
  if (typeof d.exam_date === 'string' && d.exam_date) parts.push(`📅 ${d.exam_date}`);
  if (!parts.length) return null;
  return <p className="mt-0.5 text-xs text-ink-soft">{parts.join(' · ')}</p>;
}
