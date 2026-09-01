import { Activity, CheckCircle2, Clock, Hourglass, Sparkles } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Insights } from '../lib/types';
import { PageHeader, Button, Card, EmptyState, Spinner } from '../components/ui';
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
    <div className="space-y-4">
      <PageHeader title={t('insights.title')}>
        <Button variant="ghost" className="!px-3 !py-2 text-xs" onClick={() => summary.run()} disabled={summary.loading}>
          {summary.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('ai.insightsSummary')}
        </Button>
      </PageHeader>
      <AiResultBox loading={summary.loading} result={summary.result} compact />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={Clock} value={`${data.avgFocusMinutes}m`} label={t('insights.avgFocus')} />
        <Stat icon={CheckCircle2} value={String(data.tasksCompleted)} label={t('insights.tasksDone')} />
        <Stat icon={Hourglass} value={`${data.studyMinutesToday}m`} label={t('insights.studyToday')} />
        <Stat icon={Activity} value={data.productiveHour || '—'} label={t('insights.productiveHour')} />
      </div>

      {/* Quick smart insights — one line each, derived deterministically */}
      {(() => {
        const weekDone = data.weekTasksDone ?? 0;
        const focusThis = data.focusThisWeek ?? 0;
        const focusPrev = data.focusPrevWeek ?? 0;
        const focusStreak = data.focusDaysStreak ?? 0;
        const items: string[] = [];
        const overdue = data.overdueCount ?? postponedTasks.length;
        if (overdue > 0) items.push(`⚠ ${overdue} مهام متأخرة — رتّبها حسب العاجل.`);
        else if (postponedTasks.length === 0 && weekDone > 0) items.push(`✨ لا توجد مهام متأخرة — أسبوع مرتب.`);
        if (weekDone > 0) items.push(`✓ أنجزت ${weekDone} مهام هذا الأسبوع.`);
        const focusDelta = focusThis - focusPrev;
        if (focusDelta !== 0) {
          items.push(focusDelta > 0 ? `⏱ تركيز هذا الأسبوع +${focusDelta} د عن السابق — استمر.` : `⏱ تركيز هذا الأسبوع ${focusDelta} د عن السابق — جلسة قصيرة تكفي.`);
        } else if (focusThis > 0) {
          items.push(`⏱ ${focusThis} دقيقة تركيز هذا الأسبوع.`);
        }
        if (focusStreak > 1) items.push(`🔥 ${focusStreak} أيام تركيز متتالية — لا تقطعها اليوم.`);
        if (items.length === 0) return null;
        return (
          <Card className="border-brand-lighter/60 bg-brand-soft/30">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-brand-dark" /> ذكاء سريع
            </h2>
            <ul className="space-y-1.5">
              {items.slice(0, 4).map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}

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
