import { cloneElement, isValidElement, useEffect, useId, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useT } from '../lib/i18n';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-brand-lighter border-t-brand ${className}`}
      aria-label="loading"
    />
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'icon';
  children: ReactNode;
}) {
  const base = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    icon: 'btn-icon',
  }[variant];
  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card p-4 ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

/** Consistent page header: title + optional subtitle + actions. */
export function PageHeader({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Compact section heading with an optional trailing action. */
export function SectionHeader({
  title,
  icon: Icon,
  action,
  className = '',
}: {
  title: string;
  icon?: React.ElementType;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-center justify-between gap-2 ${className}`}>
      <h2 className="card-title">
        {Icon && <Icon className="h-4 w-4 text-brand-dark" />}
        {title}
      </h2>
      {action}
    </div>
  );
}

/** Compact KPI panel: icon + value + label, one per tile. */
export function StatCard({
  value,
  label,
  icon: Icon,
  to,
  className = '',
}: {
  value: string;
  label: string;
  icon: React.ElementType;
  to?: string;
  className?: string;
}) {
  const inner = (
    <Card hover className={`!p-3 text-center ${className}`}>
      <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="text-lg font-extrabold leading-none text-ink" dir="auto">{value}</p>
      <p className="mt-1 truncate text-[11px] text-ink-faint">{label}</p>
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

/**
 * Compact card — a small information-dense surface.
 * Prefer this over the default `Card` inside dashboards and grids.
 */
export function CompactCard({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={`card !p-3 ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

/**
 * Small titled widget used on the home dashboard.
 * Icon + title row with an optional trailing link/action, then the body.
 */
export function SmartWidget({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  icon?: React.ElementType;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <CompactCard className={`flex flex-col ${className}`}>
      <div className="mb-1.5 flex min-h-5 items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />}
        <h3 className="truncate text-xs font-bold text-ink">{title}</h3>
        {action && <span className="ms-auto flex shrink-0 items-center">{action}</span>}
      </div>
      <div className={`min-w-0 flex-1 text-[13px] ${bodyClassName}`}>{children}</div>
    </CompactCard>
  );
}

/**
 * Compact action button used in quick-action strips and command rows.
 * One tap target; icon-first with an optional short label and tone.
 */
export function QuickAction({
  label,
  icon: Icon,
  onClick,
  tone = 'default',
  disabled = false,
  title,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  tone?: 'default' | 'brand' | 'accent' | 'warm';
  disabled?: boolean;
  title?: string;
}) {
  const tones = {
    default: 'bg-card text-ink-soft border-line hover:border-brand-lighter hover:text-brand-dark hover:bg-brand-soft/60',
    brand: 'bg-brand-soft text-brand-dark border-brand-lighter/70 hover:bg-brand-soft',
    accent: 'bg-brand text-white border-transparent hover:bg-brand-dark shadow-button',
    warm: 'bg-warn-bg text-warn border-warn-border hover:bg-warn-bg/70',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:ring-4 focus-visible:ring-brand/20 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${tones[tone]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Small colored status pill for a compact summary line. */
export function StatusChip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'ok' | 'warn' | 'danger' | 'brand' | 'neutral';
  className?: string;
}) {
  const tones = {
    ok: 'bg-ok-bg text-ok',
    warn: 'bg-warn-bg text-warn border border-warn-border',
    danger: 'bg-danger-bg text-danger border border-danger-border',
    brand: 'bg-brand-soft text-brand-dark',
    neutral: 'bg-elevated text-ink-soft border border-line',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold leading-5 ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/**
 * One-line contextual suggestion banner (intelligent micro-interaction).
 * Text on the start side; optional inline actions on the end side.
 */
export function SmartSuggestion({
  text,
  actions,
  tone = 'brand',
  className = '',
}: {
  text: string;
  actions?: ReactNode;
  tone?: 'brand' | 'warn' | 'info';
  className?: string;
}) {
  const tones = {
    brand: 'border-brand-lighter/70 bg-brand-soft/70 text-ink',
    warn: 'border-warn-border bg-warn-bg/80 text-ink',
    info: 'border-line bg-elevated/70 text-ink',
  } as const;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-[13px] leading-relaxed ${tones[tone]} ${className}`} role="status">
      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />
        <span>{text}</span>
      </p>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Lightweight skeleton placeholder that respects reduced motion. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ProgressBar({
  value,
  tone = 'brand',
  className = '',
  barClassName = '',
}: {
  value: number;
  tone?: 'brand' | 'warn' | 'danger' | 'ok';
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const tones = {
    brand: 'bg-brand-accent',
    warn: 'bg-warn',
    danger: 'bg-danger',
    ok: 'bg-ok',
  } as const;
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-pill ${tones[tone]} transition-all duration-500 ${barClassName}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label?: string;
  children: ReactNode;
  hint?: string;
}) {
  const controlId = useId();
  let control = children;
  let labelFor: string | undefined;

  if (label && isValidElement(children)) {
    const child = children as ReactElement<{ id?: string; 'aria-label'?: string; label?: string }>;
    if (typeof child.type === 'string' && ['input', 'textarea', 'select'].includes(child.type)) {
      labelFor = child.props.id || controlId;
      control = cloneElement(child, {
        id: labelFor,
        'aria-label': child.props['aria-label'] || label,
      });
    } else if (child.type === Select) {
      control = cloneElement(child, { label: child.props.label || label });
    }
  }

  return (
    <div>
      {label && <label className="label" htmlFor={labelFor}>{label}</label>}
      {control}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill transition-colors ${
        checked ? 'bg-brand' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        } rtl:checked:translate-x-[-20px]`}
        style={{ width: '18px', height: '18px' }}
      />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="card relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg animate-fadeIn flex-col bg-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="btn-icon" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  text,
  action,
  art,
}: {
  text: string;
  action?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <div className="empty relative overflow-hidden">
      <span className="pointer-events-none absolute -top-8 -start-8 h-24 w-24 rounded-full bg-brand-soft/70 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-10 -end-10 h-28 w-28 rounded-full bg-brand-lighter/40 blur-2xl" aria-hidden="true" />
      {art && <div className="mx-auto mb-2 max-w-40 animate-floatYSlow">{art}</div>}
      <p className="relative">{text}</p>
      {action && <div className="relative mt-2">{action}</div>}
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
  className = '',
  label,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`select ${className}`}
    >
      {children}
    </select>
  );
}

export function Badge({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'warn' | 'danger' | 'ok' | 'neutral' }) {
  const tones = {
    brand: 'bg-brand-soft text-brand-dark',
    warn: 'bg-warn-bg text-warn border border-warn-border',
    danger: 'bg-danger-bg text-danger border border-danger-border',
    ok: 'bg-ok-bg text-ok',
    neutral: 'bg-elevated text-ink-soft border border-line',
  };
  return <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
