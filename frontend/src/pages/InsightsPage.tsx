import { Activity, CheckCircle2, Clock, Hourglass, Sparkles } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Insights } from '../lib/types';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';

export default function InsightsPage() {
  const t = useT();
  const { data, loading } = useApi<Insights>('/insights');
  const summary = useAiAction('insights-summary');

  if (loading) return <Spinner className="mx-auto mt-10 block h-8 w-8" />;
  if (!data) return <EmptyState text={t('common.noData')} />;

  const postponedTasks = Array.isArray(data.postponedTasks) ? data.postponedTasks : [];
  const sleepStudy = Array.isArray(data.sleepStudy) ? data.sleepStudy : [];
  const maxSessions = Math.max(1, ...sleepStudy.map((x) => x.sessions));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="section-title">{t('insights.title')}</h1>
        <Button variant="ghost" className="!px-3 !py-2 text-xs" onClick={() => summary.run()} disabled={summary.loading}>
          {summary.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('ai.insightsSummary')}
        </Button>
      </div>
      <AiResultBox loading={summary.loading} result={summary.result} compact />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={Clock} value={`${data.avgFocusMinutes}m`} label={t('insights.avgFocus')} />
        <Stat icon={CheckCircle2} value={String(data.tasksCompleted)} label={t('insights.tasksDone')} />
        <Stat icon={Hourglass} value={`${data.studyMinutesToday}m`} label={t('insights.studyToday')} />
        <Stat icon={Activity} value={data.productiveHour || '—'} label={t('insights.productiveHour')} />
      </div>

      {postponedTasks.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-bold text-ink">{t('insights.postponed')}</h2>
          <ul className="divide-y divide-line">
            {postponedTasks.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{p.title}</span>
                <span className="text-xs text-danger">{p.due_date}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sleepStudy.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-bold text-ink">{t('insights.sleepStudy')}</h2>
          <p className="mb-3 text-xs text-ink-faint">
            في الأيام التي سجلت فيها نومًا أكثر، أتممت أيضًا جلسات دراسة أكثر. هذه ملاحظة وصفية فقط، وليست ادعاءً بعلاقة سببية.
          </p>
          <div className="flex h-28 items-end gap-2">
            {sleepStudy.map((x, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-ink-faint">{x.sessions}</span>
                <div
                  className="w-full rounded-t-md bg-brand-accent"
                  style={{ height: `${(x.sessions / maxSessions) * 80}px` }}
                />
                <span className="text-[10px] text-ink-faint">{x.sleep ?? '—'}h</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {postponedTasks.length === 0 && (
        <p className="text-sm text-ink-faint">{t('common.noData')}</p>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) {
  return (
    <Card className="!p-4 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-brand-dark" />
      <p className="text-xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-ink-faint">{label}</p>
    </Card>
  );
}
