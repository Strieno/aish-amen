import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import { useT } from '../lib/i18n';

interface Preview {
  type: string;
  id: string;
  title: string;
  sub?: string | null;
  links: { type: string; id: string; title: string }[];
}

/**
 * Entity chip with hover preview: shows a lightweight card with the
 * entity's summary and its relationships without leaving the page.
 */
export default function EntityChip({
  type,
  id,
  title,
  sub,
  className = '',
  clickable = true,
}: {
  type: string;
  id: string;
  title: string;
  sub?: string;
  className?: string;
  clickable?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const Icon = entityIcon(type);
  const route = entityRoute(type, id);

  const fetchPreview = () => {
    if (preview || loading) return;
    setLoading(true);
    api
      .get<Preview>(`/entities/preview?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
      .then((p) => setPreview(p))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const chip = (
    <span
      className={`inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-pill bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand-lighter ${className}`}
      onMouseEnter={() => {
        timer.current = window.setTimeout(() => {
          setOpen(true);
          fetchPreview();
        }, 300);
      }}
      onMouseLeave={() => {
        if (timer.current) window.clearTimeout(timer.current);
        setOpen(false);
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{title}</span>
      {sub && <span className="hidden text-[10px] font-normal opacity-70 sm:inline">{sub}</span>}
    </span>
  );

  if (!clickable) return chip;

  return (
    <span className="relative inline-block max-w-full">
      {chip}
      {open && (
        <span className="absolute start-0 top-full z-50 mt-1 block w-64 rounded-xl border border-line bg-card p-3 shadow-card-hover animate-fadeIn">
          {loading ? (
            <span className="block py-2 text-center text-xs text-ink-faint">{t('common.loading')}</span>
          ) : preview ? (
            <>
              <p className="truncate text-sm font-bold text-ink">{preview.title}</p>
              {preview.sub && <p className="text-xs text-ink-faint">{preview.sub}</p>}
              {(preview.links || []).length > 0 && (
                <div className="mt-2 border-t border-line pt-2">
                  <p className="mb-1 text-[10px] font-bold text-ink-faint">{t('graph.relatedTo')} ({(preview.links || []).length})</p>
                  <ul className="space-y-0.5">
                    {(preview.links || []).slice(0, 3).map((l) => (
                      <li key={`${l.type}:${l.id}`} className="truncate text-xs text-ink-soft">
                        • {l.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Link
                to={route}
                className="mt-2 inline-block text-xs font-bold text-brand-dark hover:underline"
              >
                {t('graph.open')} →
              </Link>
            </>
          ) : (
            <span className="block py-2 text-center text-xs text-ink-faint">{t('common.notFound')}</span>
          )}
        </span>
      )}
    </span>
  );
}
