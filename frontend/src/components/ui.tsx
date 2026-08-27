import { cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useId } from 'react';
import { X } from 'lucide-react';
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
  return <div className={`card p-5 ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors ${
        checked ? 'bg-brand' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        } rtl:checked:translate-x-[-20px]`}
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
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-lg animate-fadeIn bg-card p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="btn-icon" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
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
      {art && <div className="mx-auto mb-4 max-w-52 animate-floatYSlow">{art}</div>}
      <p className="relative mb-3">{text}</p>
      {action}
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
      className={`input ${className}`}
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
  return <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
