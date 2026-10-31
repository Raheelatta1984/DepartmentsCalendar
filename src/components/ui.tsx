import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Search, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */
export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-24px_rgba(15,23,42,0.35)] ${
        padded ? 'p-4' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-[min(100%,32rem)]">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges & pills                                                     */
/* ------------------------------------------------------------------ */
const toneClasses: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  dot = false,
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses | string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        toneClasses[tone] ?? toneClasses.neutral
      } ${className}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  color = '#3b82f6',
  size = 28,
  ring = false,
}: {
  name: string;
  color?: string;
  size?: number;
  ring?: boolean;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold text-white ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      style={{ background: color, width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
      title={name}
    >
      {initials || '?'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                            */
/* ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
};

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled,
  title,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
      } ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  title,
  className = '',
  active = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        active
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                      */
/* ------------------------------------------------------------------ */
export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
      <span>{children}</span>
      {hint ? <span className="text-[10px] font-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${fieldClass} ${className}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`${fieldClass} min-h-[76px] ${className}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <div className="relative">
      <select {...rest} className={`${fieldClass} appearance-none pr-8 ${className}`}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-800">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} pl-8`}
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 backdrop-blur-sm sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-fade-up flex max-h-[calc(100dvh-1rem)] w-full ${width} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-4rem)] sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3 py-3 sm:px-5 sm:py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <IconButton onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-5">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                       */
/* ------------------------------------------------------------------ */
export function Progress({
  value,
  tone = 'brand',
  height = 6,
  showLabel = false,
}: {
  value: number;
  tone?: 'brand' | 'good' | 'warn' | 'danger' | 'purple' | 'slate';
  height?: number;
  showLabel?: boolean;
}) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-500',
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-rose-500',
    purple: 'bg-violet-500',
    slate: 'bg-slate-400',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height }}>
        <div
          className={`h-full rounded-full transition-all ${colors[tone]}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      {showLabel ? <span className="w-9 text-right text-[11px] font-medium tabular-nums text-slate-500">{Math.round(value)}%</span> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  suffix,
  delta,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  delta?: number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'brand' | 'good' | 'warn' | 'danger' | 'purple';
}) {
  const bg: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    good: 'bg-emerald-50 text-emerald-600',
    warn: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    purple: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</span>
            {suffix ? <span className="text-xs font-medium text-slate-400">{suffix}</span> : null}
            {typeof delta === 'number' ? (
              <span
                className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                  delta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {delta}%
              </span>
            ) : null}
          </div>
          {hint ? <div className="mt-1 truncate text-[11px] text-slate-500">{hint}</div> : null}
        </div>
        {icon ? <div className={`rounded-lg p-2 ${bg[tone]}`}>{icon}</div> : null}
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      <div className="mb-2 rounded-full bg-white p-2.5 text-slate-400 ring-1 ring-slate-200">
        {icon ?? <AlertTriangle className="h-5 w-5" />}
      </div>
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-xs text-slate-500">{description}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
  guideSkip = false,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** Filter-style tabs (period grain, status chips) are not sub-sections of the screen. */
  guideSkip?: boolean;
}) {
  return (
    <div className={`flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:flex-wrap sm:overflow-visible ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          data-guide-tab={guideSkip ? undefined : 'true'}
          data-guide-skip={guideSkip ? 'true' : undefined}
          data-guide-label={t.label}
          data-guide-active={value === t.id ? 'true' : undefined}
          className={`inline-flex flex-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                value === t.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'
              }`}
            >
              {t.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function TableShell({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-separate border-spacing-0 text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className = '',
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-2.5 align-middle text-slate-700 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function useLocalFilter<T>(rows: T[], predicate: (row: T, query: string) => boolean, initial = '') {
  const [query, setQuery] = useState(initial);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => predicate(r, q));
  }, [rows, query, predicate]);
  return { query, setQuery, filtered };
}
