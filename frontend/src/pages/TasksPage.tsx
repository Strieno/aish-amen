import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ListChecks, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Project, Task } from '../lib/types';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner, Toggle } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';

const STATUS_LABEL: Record<string, string> = {
  inbox: 'tasks.inbox',
  planned: 'tasks.planned',
  'in-progress': 'tasks.inProgress',
  waiting: 'tasks.waiting',
  done: 'tasks.completed',
  cancelled: 'tasks.cancelled',
};

export default function TasksPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { data: tasks, loading, refetch } = useApi<Task[]>('/tasks');
  const { data: projects } = useApi<Project[]>('/projects');

  const [status, setStatus] = useState('');
  const [energy, setEnergy] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lowEnergyOnly, setLowEnergyOnly] = useState(false);

  const [editing, setEditing] = useState<Task | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [breakdownText, setBreakdownText] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [breaking, setBreaking] = useState(false);
  const quickRef = useRef<HTMLInputElement>(null);
  const interpret = useAiAction('interpret');

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowModal(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const quickAdd = async () => {
    if (!quickText.trim()) return;
    await api.post('/tasks', { title: quickText.trim(), priority: 'medium', energy: 'medium', status: 'inbox' });
    setQuickText('');
    refetch();
  };

  const toggleComplete = async (task: Task) => {
    await api.post(`/tasks/${task.id}/complete`);
    refetch();
  };

  const save = async (data: Partial<Task>) => {
    if (editing) await api.put(`/tasks/${editing.id}`, data);
    else await api.post('/tasks', data);
    setShowModal(false);
    setEditing(null);
    refetch();
  };

  const remove = async (task: Task) => {
    await api.del(`/tasks/${task.id}`);
    refetch();
  };

  const runBreakdown = async () => {
    if (!breakdownText.trim()) return;
    setBreaking(true);
    setSteps([]);
    try {
      const r = await api.post<{ ok: boolean; steps: string[]; error?: string }>('/ai/breakdown', { text: breakdownText });
      setSteps(r.ok ? r.steps : []);
    } catch {
      setSteps([]);
    } finally {
      setBreaking(false);
    }
  };

  const approveSteps = async () => {
    const parent = await api.post<Task>('/tasks', { title: breakdownText.trim(), priority: 'medium', energy: 'medium', status: 'planned' });
    for (const s of steps) {
      await api.post('/tasks', { title: s, priority: 'low', energy: 'low', status: 'inbox', project_id: parent.id });
    }
    setSteps([]);
    setBreakdownText('');
    refetch();
  };

  let filtered = tasks || [];
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (energy) filtered = filtered.filter((t) => t.energy === energy);
  if (projectId) filtered = filtered.filter((t) => t.project_id === projectId);
  if (lowEnergyOnly) filtered = filtered.filter((t) => t.energy === 'low' && t.status !== 'done');

  const openCount = (filtered || []).filter((x) => x.status !== 'done').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="section-title">{t('tasks.title')}</h1>
        <Button onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="h-4 w-4" /> {t('tasks.add')}
        </Button>
      </div>

      {/* Quick add with smart capture */}
      <Card className="!p-3">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 shrink-0 text-brand-dark" />
          <input
            ref={quickRef}
            className="input !border-0 !shadow-none focus:ring-0"
            placeholder={t('tasks.quickAdd')}
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
          />
          <Button variant="ghost" onClick={quickAdd} className="!px-3 !py-2" title={t('common.add')}>
            <ListChecks className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => quickText.trim() && interpret.run({ text: quickText })}
            className="!px-3 !py-2"
            disabled={!quickText.trim() || interpret.loading}
            title={t('ai.interpret')}
          >
            {interpret.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1 px-1 text-[11px] text-ink-faint">{t('ai.interpretHint')}</p>

        {/* Interpretation suggestion */}
        {interpret.result?.kind === 'task' && interpret.result.suggestion && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft p-3">
            <span className="text-sm font-bold text-ink">{interpret.result.suggestion.title}</span>
            {interpret.result.suggestion.due && <Badge tone="brand">{interpret.result.suggestion.due}</Badge>}
            <Badge tone={interpret.result.suggestion.priority === 'high' ? 'danger' : 'neutral'}>
              {interpret.result.suggestion.priority || 'medium'}
            </Badge>
            <div className="ms-auto flex gap-2">
              <Button
                className="!px-3 !py-1.5 text-xs"
                onClick={async () => {
                  const s = interpret.result?.suggestion;
                  if (s?.title) {
                    await api.post('/tasks', { title: s.title, due_date: s.due || null, priority: s.priority || 'medium', energy: s.energy || 'medium', status: 'inbox' });
                    setQuickText('');
                    refetch();
                    interpret.run({ text: '' }).catch(() => {});
                  }
                }}
              >
                {t('ai.createTask')}
              </Button>
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => interpret.run({ text: '' }).catch(() => {})}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
        {interpret.result?.kind === 'journal' && interpret.result.suggestion && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-elevated p-3">
            <span className="flex-1 truncate text-sm text-ink-soft">{interpret.result.suggestion.content}</span>
            <LinkToJournal text={interpret.result.suggestion.title || ''} content={interpret.result.suggestion.content || ''} />
          </div>
        )}
        {interpret.result?.kind === 'gratitude' && interpret.result.suggestion && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-elevated p-3">
            <span className="flex-1 truncate text-sm text-ink-soft">{(interpret.result.suggestion.items || []).join('، ')}</span>
            <Button
              className="!px-3 !py-1.5 text-xs"
              onClick={async () => {
                await api.post('/gratitude', { items: interpret.result?.suggestion?.items || [] });
                interpret.run({ text: '' }).catch(() => {});
                setQuickText('');
              }}
            >
              {t('ai.createGratitude')}
            </Button>
          </div>
        )}
        {interpret.result?.kind === 'question' && <AiResultBox loading={interpret.loading} result={interpret.result} compact />}
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select className="!w-auto" value={status} onChange={setStatus} label={t('common.status')}>
          <option value="">{t('tasks.filterAll')}</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{t(v)}</option>
          ))}
        </Select>
        <Select className="!w-auto" value={energy} onChange={setEnergy} label={t('common.energy')}>
          <option value="">{t('common.energy')}: {t('common.all')}</option>
          <option value="low">{t('tasks.lowEnergy')}</option>
          <option value="medium">{t('tasks.mediumEnergy')}</option>
          <option value="high">{t('tasks.highEnergy')}</option>
        </Select>
        <Select className="!w-auto" value={projectId} onChange={setProjectId} label={t('tasks.project')}>
          <option value="">{t('tasks.project')}: {t('common.all')}</option>
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <Toggle checked={lowEnergyOnly} onChange={setLowEnergyOnly} label={t('tasks.lowEnergy')} />
          {t('tasks.lowEnergy')}
        </label>
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-8 block h-7 w-7" />
      ) : filtered.length === 0 ? (
        <EmptyState text={t('tasks.noTasks')} />
      ) : (
        <Card className="!p-2">
          <ul className="divide-y divide-line">
            {filtered.map((task) => (
              <li key={task.id} className="group flex items-start gap-3 px-3 py-3">
                <button
                  onClick={() => toggleComplete(task)}
                  aria-label={`${task.status === 'done' ? t('common.active') : t('common.done')}: ${task.title}`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                    task.status === 'done' ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'
                  }`}
                >
                  {task.status === 'done' && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${task.status === 'done' ? 'text-ink-faint line-through' : 'text-ink'}`}>
                    {task.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warn' : 'neutral'}>
                      {t(task.priority === 'high' ? 'common.high' : task.priority === 'medium' ? 'common.medium' : 'common.low')}
                    </Badge>
                    <Badge tone={task.energy === 'high' ? 'warn' : 'neutral'}>
                      {task.energy === 'low' ? '⚡' : ''}{t(task.energy === 'high' ? 'tasks.highEnergy' : task.energy === 'medium' ? 'tasks.mediumEnergy' : 'tasks.lowEnergy')}
                    </Badge>
                    {task.project_name && <Badge tone="brand">{task.project_name}</Badge>}
                    {task.course_name && <Badge tone="brand">{task.course_name}</Badge>}
                    {task.due_date && (
                      <span className={`text-xs ${task.due_date < new Date().toISOString().slice(0, 10) ? 'font-bold text-danger' : 'text-ink-faint'}`}>
                        {task.due_date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 md:invisible md:group-hover:visible md:group-focus-within:visible">
                  <button onClick={() => { setEditing(task); setShowModal(true); }} className="btn-icon !h-8 !w-8" aria-label={`${t('common.edit')}: ${task.title}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(task)} className="btn-icon !h-8 !w-8" aria-label={`${t('common.delete')}: ${task.title}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-faint">
            {openCount} {t('common.active')}
          </p>
        </Card>
      )}

      {/* AI breakdown */}
      <Card>
        <div className="mb-2 flex items-center gap-2 text-brand-dark">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-bold">{t('tasks.breakdown')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <input className="input" placeholder="دراسة OOP" aria-label={t('tasks.breakdown')} value={breakdownText} onChange={(e) => setBreakdownText(e.target.value)} />
          <Button variant="ghost" onClick={runBreakdown} disabled={breaking} aria-label={t('tasks.breakdown')}>
            {breaking ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
          </Button>
        </div>
        {steps.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-sm font-bold text-ink">{t('tasks.breakdownSteps')}</p>
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex gap-2">
              <Button onClick={approveSteps}>
                <Check className="h-4 w-4" /> {t('tasks.approve')}
              </Button>
              <Button variant="ghost" onClick={() => setSteps([])}>
                {t('tasks.reject')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Task modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? t('common.edit') : t('tasks.add')}
      >
        <TaskForm
          task={editing}
          projects={projects || []}
          onSave={save}
          onCancel={() => { setShowModal(false); setEditing(null); }}
        />
      </Modal>
    </div>
  );
}

function LinkToJournal({ text, content }: { text: string; content: string }) {
  const t = useT();
  return (
    <Link to={`/journal?new=1&title=${encodeURIComponent(text)}&content=${encodeURIComponent(content)}`}>
      <Button className="!px-3 !py-1.5 text-xs">{t('ai.createJournal')}</Button>
    </Link>
  );
}

function TaskForm({
  task,
  projects,
  onSave,
  onCancel,
}: {
  task: Task | null;
  projects: Project[];
  onSave: (d: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(task?.title || '');
  const [desc, setDesc] = useState(task?.description || '');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [energy, setEnergy] = useState(task?.energy || 'medium');
  const [due, setDue] = useState(task?.due_date || '');
  const [status, setStatus] = useState(task?.status || 'inbox');
  const [est, setEst] = useState(task?.est_minutes ? String(task.est_minutes) : '');
  const [project, setProject] = useState(task?.project_id || '');
  const [notes, setNotes] = useState(task?.notes || '');

  return (
    <div className="space-y-3">
      <Field label={t('common.title')}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('common.description')}>
        <textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.priority')}>
          <Select value={priority} onChange={(v) => setPriority(v as 'high' | 'medium' | 'low')}>
            <option value="high">{t('common.high')}</option>
            <option value="medium">{t('common.medium')}</option>
            <option value="low">{t('common.low')}</option>
          </Select>
        </Field>
        <Field label={t('common.energy')}>
          <Select value={energy} onChange={(v) => setEnergy(v as 'high' | 'medium' | 'low')}>
            <option value="low">{t('tasks.lowEnergy')}</option>
            <option value="medium">{t('tasks.mediumEnergy')}</option>
            <option value="high">{t('tasks.highEnergy')}</option>
          </Select>
        </Field>
        <Field label={t('tasks.due')}>
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label={t('tasks.estMinutes')}>
          <input type="number" className="input" value={est} onChange={(e) => setEst(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('tasks.project')}>
          <Select value={project} onChange={setProject}>
            <option value="">{t('common.none')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(v) => setStatus(v as Task['status'])}>
            {Object.keys(STATUS_LABEL).map((k) => (
              <option key={k} value={k}>{t(STATUS_LABEL[k])}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('common.notes')}>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={() => onSave({ title, description: desc, priority, energy, due_date: due || null, status, est_minutes: est ? Number(est) : null, project_id: project || null, notes })}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
