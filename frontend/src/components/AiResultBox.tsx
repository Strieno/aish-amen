import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Sparkles } from 'lucide-react';
import { useT } from '../lib/i18n';
import type { AiActionResult } from '../lib/useAiAction';
import Markdown from './Markdown';
import { Spinner } from './ui';
import SpeakButton from './SpeakButton';
import { speakAutomatically } from '../lib/speech';

/**
 * Renders the outcome of an AI action: loading, error, or markdown result,
 * with a clear note when the local model is unavailable.
 */
export default function AiResultBox({
  loading,
  result,
  onRetry,
  compact = false,
}: {
  loading: boolean;
  result: AiActionResult | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const lastSpokenRef = useRef('');
  const spokenText = result?.ok === false ? '' : result?.text || result?.answer || '';

  useEffect(() => {
    if (!spokenText || spokenText === lastSpokenRef.current) return;
    lastSpokenRef.current = spokenText;
    void speakAutomatically(spokenText);
  }, [spokenText]);

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm text-ink-faint">
        <Spinner className="h-4 w-4" />
        <span>{t('ai.thinking')}</span>
      </div>
    );
  }

  if (!result) return null;

  if (result.ok === false) {
    return (
      <div className="mt-3 rounded-xl border border-warn-border bg-warn-bg p-3 text-sm text-warn">
        <p className="mb-1 flex items-center gap-1.5 font-bold">
          <Sparkles className="h-4 w-4" /> {result.error || t('ai.error')}
        </p>
        <p className="text-xs">{t('ai.needModel')}</p>
        {onRetry && (
          <Link to="/settings" className="mt-2 inline-block text-xs font-bold underline">
            {t('ai.setup')}
          </Link>
        )}
      </div>
    );
  }

  const text = result.text || result.answer || '';
  if (!text) return null;

  return (
    <div className="mt-3">
      <div className={`rounded-xl border border-line bg-elevated ${compact ? 'p-3' : 'p-4'}`}>
        <div className="mb-1.5 flex items-center gap-1.5 text-brand-dark">
          <Leaf className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold">{t('ai.localReply')}</span>
          {result.model && (
            <span className="ms-auto truncate text-[10px] text-ink-faint" dir="ltr">
              {result.model}
            </span>
          )}
          <SpeakButton text={text} className="ms-1 !h-7 !w-7" />
        </div>
        <Markdown content={text} />
      </div>
      {result.fallback && (
        <p className="mt-1 text-xs text-ink-faint">{t('ai.fallbackReply')}</p>
      )}
    </div>
  );
}
