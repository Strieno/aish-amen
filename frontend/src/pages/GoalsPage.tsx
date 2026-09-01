import { useState } from 'react';
import { Calendar, Flag, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Goal, Milestone } from '../lib/types';
import { PageHeader, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';
import RelatedPanel from '../components/RelatedPanel';
import { PageBackdrop, celebrate } from '../components/visualizations';

const AREAS = ['education', 'health', 'work', 'money', 'home', 'personal', 'learning', 'entertainment', 'administration'];

function GoalPathArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 56" className={className} role="img" aria-label="طريق أهداف">
      <path d="M6 46 Q 30 18, 52 36 T 100 24 T 116 30" fill="none" stroke="rgb(var(--brand-accent) / 0.7)" strokeWidth="2" strokeDasharray="3 6" />
      {[
        { x: 6, y: 46 }, { x: 30, y: 18 }, { x: 52, y: 36 }, { x: 78, y: 24 }, { x: 100, y: 24 }, { x: 114, y: 30 },
      ].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 4 : 3.5} fill={i === 0 ? 'rgb(var(--line))' : 'rgb(var(--brand-accent))'} />
      ))}
      <path d="M110 20 L116 30 L106 28 Z" fill="rgb(var(--brand-accent))" />
    </svg>
  );
}

export default function GoalsPage() {
  const t = useT();
  const { data: goals, loading, refetch } = useApi<Goal[]>('/goals');
  const [areaFilter, setAreaFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('education');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [newMilestone, setNewMilestone] = useState('');
  const [reviewingGoalId, setReviewingGoalId] = useState<string | null>(null);
  const review = useAiAction('goal-review');

  const addGoal = async () => {
    if (!title.trim()) return;
    await api.post('/goals', { title, life_area: area, target_date: target || null, notes });
    setTitle('');
    setTarget('');
    setNotes('');
    setShowModal(false);
    refetch();
  };

  const addMilestone = async (goalId: string) => {
    if (!newMilestone.trim()) return;
    await api.post(`/goals/${goalId}/milestones`, { title: newMilestone.trim() });
    setNewMilestone('');
    refetch();
  };

  const toggleMilestone = async (m: Milestone) => {
    const next = !m.done;
    await api.patch(`/milestones/${m.id}`, { done: next });
    refetch();
    if (next) celebrate({ text: 'مرحلة جديدة' });
  };

  const removeGoal = async (g: Goal) => {
    await api.del(`/goals/${g.id}`);
    refetch();
  };

  const filtered = areaFilter ? (goals || []).filter((g) => g.life_area === areaFilter) : goals || [];

  return (
    <div className="relative isolate space-y-4">
      <PageBackdrop variant="path" />
      <PageHeader title={t('goals.title')}>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" /> {t('goals.add')}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAreaFilter('')} className={`chip cursor-pointer ${!areaFilter ? 'bg-brand text-white' : ''}`}>
          {t('common.all')}
        </button>
        {AREAS.map((a) => (
          <button key={a} onClick={() => setAreaFilter(a)} className={`chip cursor-pointer ${areaFilter === a ? 'bg-brand text-white' : ''}`}>
            {t(`goals.${a}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-8 block h-7 w-7" />
      ) : filtered.length === 0 ? (
        <EmptyState text={t('goals.noGoals')} art={<GoalPathArt />} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-brand-dark" />
                    <h3 className="font-bold text-ink">{g.title}</h3>
                  </div>
                  {g.life_area && <Badge tone="brand">{t(`goals.${g.life_area}`)}</Badge>}
                  {g.target_date && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
                      <Calendar className="h-3 w-3" /> {g.target_date}
                    </p>
                  )}
                </div>
                <button onClick={() => removeGoal(g)} className="btn-icon !h-8 !w-8" aria-label={`${t('common.delete')}: ${g.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-ink-faint">
                  <span>{t('goals.progress')}</span>
                  <span>{(g.milestones_done ?? 0)}/{(g.milestones_total ?? 0)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-line">
                  <div
                    className="h-full rounded-pill bg-brand-accent transition-all"
                    style={{ width: `${(g.milestones_total ?? 0) ? ((g.milestones_done ?? 0) / (g.milestones_total ?? 1)) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-bold text-ink-faint">{t('goals.milestones')}</p>
                  <button
                    onClick={() => { setReviewingGoalId(g.id); review.run({ goal_id: g.id }); }}
                    className="flex items-center gap-1 rounded-pill bg-elevated px-2.5 py-1 text-[11px] font-bold text-brand-dark transition hover:bg-brand-soft"
                    disabled={review.loading && reviewingGoalId === g.id}
                  >
                    {review.loading && reviewingGoalId === g.id ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                    {t('ai.reviewGoal')}
                  </button>
                </div>
                <ul className="space-y-1">
                  {g.milestones.map((m) => (
                    <li key={m.id}>
                      <button onClick={() => toggleMilestone(m)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start hover:bg-elevated">
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${m.done ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                          {m.done && '✓'}
                        </span>
                        <span className={`text-sm ${m.done ? 'text-ink-faint line-through' : 'text-ink'}`}>{m.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-1">
                  <input className="input !py-1.5 text-sm" placeholder={t('goals.addMilestone')} value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} />
                  <Button variant="ghost" onClick={() => addMilestone(g.id)} className="!px-3 !py-1.5" aria-label={t('goals.addMilestone')}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {reviewingGoalId === g.id && <AiResultBox loading={review.loading} result={review.result} compact />}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <RelatedPanel entityType="goal" entityId={g.id} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t('goals.add')}>
        <div className="space-y-3">
          <Field label={t('common.title')}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('goals.lifeArea')}>
              <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>{t(`goals.${a}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('goals.targetDate')}>
              <input type="date" className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          </div>
          <Field label={t('common.notes')}>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button onClick={addGoal}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
