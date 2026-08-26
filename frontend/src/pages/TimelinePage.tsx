import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import type { TimelineEvent } from '../lib/types';
import { Button, EmptyState, Select, Spinner } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';

const DOMAINS = ['conversations', 'tasks', 'journal', 'checkins', 'focus', 'study', 'goals', 'work', 'safe', 'memories'];

export default function TimelinePage() {
  const t = useT();
  const [days, setDays] = useState(30);
  const [domains, setDomains] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const { data, loading } = useApi<TimelineEvent[]>(
    `/timeline?days=${days}${domains.length ? `&domains=${domains.join(',')}` : ''}`,
    [days, domains.join(',')],
  );
  const synthesize = useAiAction('synthesize');

  const groups = useMemo(() => {
    const events = data || [];
    const map = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      const d = new Date(e.ts);
      let key: string;
      if (groupBy === 'day') key = d.toISOString().slice(0, 10);
      else if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        key = start.toISOString().slice(0, 10);
      } else key = d.toISOString().slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data, groupBy]);

  const toggleDomain = (d: string) => {
    setDomains((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="section-title">{t('timeline.title')}</h1>
          <p className="text-sm text-ink-faint">{t('timeline.hint')}</p>
        </div>
        <Button
          variant="ghost"
          className="!px-3 !py-2 text-xs"
          onClick={() => synthesize.run({ period: days <= 7 ? 'day' : 'week', days })}
          disabled={synthesize.loading}
        >
          {synthesize.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('timeline.summarize')}
        </Button>
      </div>

      <AiResultBox loading={synthesize.loading} result={synthesize.result} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select className="!w-32" value={String(days)} onChange={(v) => setDays(Number(v))} label={t('timeline.days')}>
          <option value="7">7 {t('timeline.days') === 'الفترة' ? 'أيام' : 'days'}</option>
          <option value="30">30 {t('timeline.days') === 'الفترة' ? 'يومًا' : 'days'}</option>
          <option value="90">90 {t('timeline.days') === 'الفترة' ? 'يومًا' : 'days'}</option>
        </Select>
        <Select className="!w-32" value={groupBy} onChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')} label={t('timeline.days')}>
          <option value="day">يوم</option>
          <option value="week">أسبوع</option>
          <option value="month">شهر</option>
        </Select>
        <div className="flex flex-wrap gap-1">
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => toggleDomain(d)}
              className={`chip cursor-pointer ${domains.includes(d) ? 'bg-brand text-white' : ''}`}
            >
              {t(d === 'conversations' ? 'nav.chat' : d === 'tasks' ? 'nav.tasks' : d === 'journal' ? 'nav.journal' : d === 'checkins' ? 'memory.sourceCheckin' : d === 'focus' ? 'nav.focus' : d === 'study' ? 'nav.study' : d === 'goals' ? 'nav.goals' : d === 'work' ? 'nav.work' : d === 'safe' ? 'nav.safe' : d === 'memories' ? 'nav.memory' : d)}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <Spinner className="mx-auto mt-10 block h-7 w-7" />
      ) : groups.length === 0 ? (
        <EmptyState text={t('timeline.empty')} />
      ) : (
        <div className="relative space-y-6 before:absolute before:inset-y-0 before:start-[13px] before:w-px before:bg-line">
          {groups.map(([key, events]) => (
            <div key={key}>
              <p className="mb-2 ps-10 text-sm font-bold text-brand-dark">{key}</p>
              <div className="space-y-1.5">
                {events.map((e) => {
                  const Icon = entityIcon(e.entity_type || 'task');
                  const route = e.entity_type && e.entity_id ? entityRoute(e.entity_type, e.entity_id) : null;
                  return (
                    <div key={e.id} className="relative flex items-start gap-3 ps-10">
                      <span className="absolute start-[9px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-brand-accent ring-4 ring-card" />
                      <div className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 transition hover:shadow-card">
                        <Icon className="h-4 w-4 shrink-0 text-brand-dark" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{e.summary}</p>
                          <p className="text-[11px] text-ink-faint" dir="ltr">{e.ts.slice(11, 16)}</p>
                        </div>
                        {route && (
                          <Link to={route} className="shrink-0 text-xs font-bold text-brand-dark hover:underline">
                            {t('graph.open')} →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
