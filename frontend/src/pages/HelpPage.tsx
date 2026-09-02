import { Link } from 'react-router-dom';
import { ArrowLeft, CornerDownLeft, Keyboard, Mic, Plus, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { NAV_ITEMS, navGroups } from '../lib/nav';
import { useT } from '../lib/i18n';
import { CompactCard, SmartWidget } from '../components/ui';

/**
 * Help — a 30-second quick-start guide, shortcuts and a map of every section.
 * Kept deliberately simple and calm.
 */
export default function HelpPage() {
  const t = useT();
  const groups = navGroups(NAV_ITEMS);
  const steps = [
    { icon: Sparkles, text: t('help.step1') },
    { icon: Plus, text: t('help.step2') },
    { icon: ShieldCheck, text: t('help.step3') },
    { icon: Rocket, text: t('help.step4') },
  ];

  const shortcuts = [
    { kbd: 'Ctrl + K', title: t('help.shortcut.search') },
    { kbd: 'Ctrl + Shift + A', title: t('help.shortcut.capture') },
    { kbd: '✦', title: t('help.shortcut.assistant') },
    { kbd: '🎙', title: t('help.shortcut.voice') },
  ];

  const tips = [
    t('help.tip1'),
    t('help.tip2'),
    t('help.tip3'),
    t('help.tip4'),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink">{t('help.title')}</h1>
          <p className="mt-0.5 text-[13px] text-ink-faint">{t('help.subtitle')}</p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-bold text-white shadow-button transition hover:bg-brand-dark active:scale-[0.98]"
        >
          <Rocket className="h-4 w-4" aria-hidden="true" /> {t('help.start')}
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Quick start */}
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Sparkles className="h-4 w-4 text-brand-dark" aria-hidden="true" /> {t('help.quickStart')}
          </h2>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i}>
                <CompactCard className="flex items-start gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-dark">
                    <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <p className="pt-0.5 text-[13px] leading-relaxed text-ink-soft">{s.text}</p>
                </CompactCard>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          {/* Shortcuts */}
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
              <Keyboard className="h-4 w-4 text-brand-dark" aria-hidden="true" /> {t('help.shortcuts')}
            </h2>
            <CompactCard className="divide-y divide-line !p-1">
              {shortcuts.map((s) => (
                <div key={s.title} className="flex items-center gap-2 px-2.5 py-2">
                  <kbd className="inline-flex min-w-16 items-center justify-center gap-1 rounded-lg border border-line bg-elevated px-2 py-1 text-[11px] font-bold text-ink-soft">
                    {s.kbd}
                  </kbd>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.title}</span>
                  {s.kbd === '✦' && <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />}
                  {s.kbd === '🎙' && <Mic className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />}
                  {s.kbd === 'Ctrl + Shift + A' && <Plus className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />}
                  {s.kbd === 'Ctrl + K' && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />}
                </div>
              ))}
            </CompactCard>
          </div>

          {/* Tips */}
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
              <ShieldCheck className="h-4 w-4 text-brand-dark" aria-hidden="true" /> {t('help.tipsTitle')}
            </h2>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Privacy note */}
          <div className="rounded-xl border border-line bg-elevated/50 px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
            🛡 {t('help.privacyNote')}
          </div>
        </div>
      </div>

      {/* Explore sections */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
          <ArrowLeft className="h-4 w-4 text-brand-dark rtl:rotate-180" aria-hidden="true" /> {t('help.exploreTitle')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map(({ group, items }) => (
            <SmartWidget key={group.id} title={t(group.labelKey)}>
              <div className="grid gap-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-soft transition hover:bg-brand-soft/60 hover:text-brand-dark"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{t(item.labelKey)}</span>
                      <span className="truncate text-[11px] text-ink-faint">{t(item.hintKey || '')}</span>
                    </Link>
                  );
                })}
              </div>
            </SmartWidget>
          ))}
        </div>
      </div>
    </div>
  );
}
