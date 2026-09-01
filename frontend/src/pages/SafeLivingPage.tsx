import { useState } from 'react';
import { CheckCircle2, Pencil, Plus, ShieldCheck, Sparkles, Trash2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { SafePlan, TodayData } from '../lib/types';
import { PageHeader, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';
import CheckinCard from '../components/CheckinCard';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';
import { SafeLivingRings, LivingGarden } from '../components/visualizations';

const LEVEL: Record<string, { key: string; tone: 'ok' | 'warn' | 'danger' }> = {
  stable: { key: 'today.stable', tone: 'ok' },
  'slightly-overloaded': { key: 'today.slightly', tone: 'warn' },
  overloaded: { key: 'today.overloaded', tone: 'danger' },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

function ringsFrom(data: TodayData | null) {
  const done = data?.stats.doneToday ?? 0;
  const open = data?.stats.openTotal ?? 0;
  const focus = data?.stats.focusMinutesToday ?? 0;
  const energy = data?.checkin?.energy ?? null;
  const stress = data?.checkin?.stress ?? null;
  return [
    { key: 'calm', label: 'العيش الآمن', value: data?.safe?.level === 'stable' ? 0.9 : data?.safe?.level === 'slightly-overloaded' ? 0.55 : 0.25, color: 'accent' as const },
    { key: 'tasks', label: 'الإنجاز', value: clamp(done / Math.max(4, done + Math.max(0, open - done))), color: 'brand' as const },
    { key: 'focus', label: 'التركيز', value: clamp(focus / 60), color: 'warn' as const },
    { key: 'care', label: 'العناية', value: energy && stress ? clamp((energy / 5 + (6 - stress) / 6) / 2) : 0.1, color: 'danger' as const },
  ];
}

function gardenFrom(data: TodayData | null) {
  return {
    tasks: data?.stats.doneToday ?? 0,
    focus: Math.round((data?.stats.focusMinutesToday ?? 0) / 25),
    gratitude: 0,
    goals: (data?.intelligence?.goals ?? []).filter((g) => (g.progress ?? 0) >= 0.5).length,
  };
}

export default function SafeLivingPage() {
  const t = useT();
  const { data: status } = useApi<{ level: string; factors: unknown }>('/safe/status');
  const { data: plans, loading, refetch } = useApi<SafePlan[]>('/safe/plans');
  const { data: sessions, refetch: refetchSessions } = useApi<{ plan_name?: string; status: string }[]>('/safe/sessions');
  const { data: today, refetch: refetchToday } = useApi<TodayData>('/dashboard/today');

  const [editing, setEditing] = useState<SafePlan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const analyze = useAiAction('analyze-safe');

  const activeSession = (sessions || []).find((s) => s.status === 'active');
  const level = LEVEL[status?.level || 'stable'];

  const activate = async (plan: SafePlan) => {
    await api.post('/safe/activate', { plan_id: plan.id });
    refetchSessions();
  };
  const endActive = async () => {
    await api.post('/safe/end');
    refetchSessions();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('safe.title')}>
        <Button onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="h-4 w-4" /> {t('safe.addPlan')}
        </Button>
      </PageHeader>

      {/* Daily check-in — the grounding that powers today's suggestions */}
      <CheckinCard checkin={today?.checkin ?? null} onSaved={() => refetchToday()} />

      {/* Status + active plan */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-dark">
              <ShieldCheck className="h-4 w-4" />
              <h2 className="text-sm font-bold">{t('safe.statusTitle')}</h2>
            </div>
            <Badge tone={level.tone}>{t(level.key)}</Badge>
          </div>
          <p className="text-xs leading-relaxed text-ink-faint">
            {t('today.status')} — تقدير تنظيمي مبني على المهام والجدول وتسجيل الحالة، وليس تشخيصًا طبيًا.
          </p>
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2 text-brand-dark">
            <CheckCircle2 className="h-4 w-4" />
            <h2 className="text-sm font-bold">{t('safe.planActive')}</h2>
          </div>
          {activeSession ? (
            <div>
              <p className="font-semibold text-ink">{activeSession.plan_name}</p>
              <Button variant="danger" className="mt-2 !px-3 !py-1.5 text-xs" onClick={endActive}>
                <XCircle className="h-4 w-4" /> {t('safe.endActive')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-faint">{t('common.none')} — {t('safe.activate')}</p>
          )}
        </Card>
      </div>

      {/* Visual identity — rings + garden */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center gap-2 text-brand-dark">
            <ShieldCheck className="h-4 w-4" />
            <h2 className="text-sm font-bold">{t('today.rings')}</h2>
          </div>
          <SafeLivingRings segments={ringsFrom(today)} size={120} />
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2 text-brand-dark">
            <Sparkles className="h-4 w-4" />
            <h2 className="text-sm font-bold">{t('today.garden')}</h2>
          </div>
          <div className="flex justify-center">
            <LivingGarden stats={gardenFrom(today)} />
          </div>
        </Card>
      </div>

      {/* Situation analysis */}
      <Card>
        <div className="mb-2 flex items-center gap-2 text-brand-dark">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-bold">{t('safe.analyze')}</h2>
        </div>
        <div className="flex gap-2">
          <textarea className="input min-h-[60px] flex-1" placeholder={t('safe.analyzePlaceholder')} aria-label={t('safe.analyzePlaceholder')} value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
          <Button onClick={() => analysis.trim() && analyze.run({ text: analysis })} disabled={!analysis.trim() || analyze.loading}>
            {analyze.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('ai.analyze')}
          </Button>
        </div>
        <AiResultBox loading={analyze.loading} result={analyze.result} />
      </Card>

      {/* Plans */}
      {loading ? (
        <Spinner className="mx-auto mt-6 block h-6 w-6" />
      ) : (plans || []).length === 0 ? (
        <EmptyState text={t('safe.plans')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(plans || []).map((p) => (
            <Card key={p.id}>
              <div className="mb-1 flex items-start justify-between">
                <h3 className="font-bold text-ink">{p.name}</h3>
                <div className="flex gap-0.5">
                  <button onClick={() => { setEditing(p); setShowModal(true); }} className="btn-icon !h-8 !w-8" aria-label={`${t('common.edit')}: ${p.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={async () => { await api.del(`/safe/plans/${p.id}`); refetch(); }}
                    className="btn-icon !h-8 !w-8"
                    aria-label={`${t('common.delete')}: ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {p.trigger && <p className="mb-2 text-xs text-ink-faint">{t('safe.trigger')}: {p.trigger}</p>}
              {p.signs && <p className="mb-2 text-sm text-ink-soft">{p.signs}</p>}
              {p.immediate_actions?.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-xs font-bold text-ink-faint">{t('safe.immediate')}</p>
                  <ul className="space-y-0.5">
                    {p.immediate_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                        <span className="mt-0.5 text-brand-dark">•</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.not_to_do?.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-xs font-bold text-ink-faint">{t('safe.notToDo')}</p>
                  <ul className="space-y-0.5">
                    {p.not_to_do.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-danger">
                        <span>✕</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button className="mt-2 w-full" onClick={() => activate(p)}>
                <ShieldCheck className="h-4 w-4" /> {t('safe.activate')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('common.edit') : t('safe.addPlan')}>
        <PlanForm
          plan={editing}
          onDone={() => { setShowModal(false); setEditing(null); refetch(); }}
        />
      </Modal>
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan: SafePlan | null; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(plan?.name || '');
  const [trigger, setTrigger] = useState(plan?.trigger || '');
  const [signs, setSigns] = useState(plan?.signs || '');
  const [actions, setActions] = useState((plan?.immediate_actions || []).join('\n'));
  const [notToDo, setNotToDo] = useState((plan?.not_to_do || []).join('\n'));
  const [reminders, setReminders] = useState((plan?.reminders || []).join('\n'));
  const [aiInst, setAiInst] = useState(plan?.ai_instructions || '');

  const save = async () => {
    const payload = {
      name,
      trigger,
      signs,
      immediate_actions: actions.split('\n').map((x) => x.trim()).filter(Boolean),
      not_to_do: notToDo.split('\n').map((x) => x.trim()).filter(Boolean),
      reminders: reminders.split('\n').map((x) => x.trim()).filter(Boolean),
      ai_instructions: aiInst,
    };
    if (plan) await api.put(`/safe/plans/${plan.id}`, payload);
    else await api.post('/safe/plans', payload);
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label={t('common.name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t('safe.trigger')}><input className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)} /></Field>
      <Field label={t('safe.signs')}><textarea className="input" rows={2} value={signs} onChange={(e) => setSigns(e.target.value)} /></Field>
      <Field label={t('safe.immediate')} hint={t('common.notes') + ' — ' + t('common.add')}><textarea className="input" rows={3} value={actions} onChange={(e) => setActions(e.target.value)} /></Field>
      <Field label={t('safe.notToDo')}><textarea className="input" rows={2} value={notToDo} onChange={(e) => setNotToDo(e.target.value)} /></Field>
      <Field label={t('safe.reminders')}><textarea className="input" rows={2} value={reminders} onChange={(e) => setReminders(e.target.value)} /></Field>
      <Field label={t('safe.aiInstructions')}><textarea className="input" rows={2} value={aiInst} onChange={(e) => setAiInst(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
        <Button onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  );
}
