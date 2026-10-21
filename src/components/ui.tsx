import type { ReactNode, InputHTMLAttributes } from 'react'
import { Search } from 'lucide-react'
export { Modal } from '@/components/Modal'
import type { LucideIcon } from 'lucide-react'
import DocumentTitle from '@/components/DocumentTitle'

// Shared presentation primitives. Every page composes these so headings,
// metrics, statuses and empty states look and behave the same everywhere.

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    // No margins: the page root (.page) spaces sections with its gap.
    // Action order: secondary actions, export/print, then at most one primary last.
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      {typeof title === 'string' && <DocumentTitle title={title} />}
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="page-title break-words">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-faint">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// One card, figures side by side with hairline dividers. Flex-wrap rather than
// a grid: cells on a short last row stretch to fill it, so a cell is never left
// empty and every figure in a row shares one height. `cols` sets how many fit
// per row on wide screens.
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const basis = { 2: 'sm:[&>*]:basis-[18rem]', 3: 'sm:[&>*]:basis-[14rem]', 4: 'sm:[&>*]:basis-[13rem]', 5: 'sm:[&>*]:basis-[11rem]' }[cols]
  return <div className={`card flex flex-wrap overflow-hidden ${basis}`}>{children}</div>
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  href,
  unit,
}: {
  label: ReactNode
  /** null while loading: renders a skeleton instead of a placeholder dash */
  value: ReactNode | null
  hint?: ReactNode
  icon?: LucideIcon
  tone?: 'neutral' | 'danger' | 'warning' | 'success'
  href?: string
  /** Shown after the number in the quiet colour (kg, sqft). */
  unit?: string
}) {
  const hintTone = { neutral: 'text-faint', danger: 'text-danger', warning: 'text-warning', success: 'text-success' }[tone]
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label truncate">{label}</span>
        {Icon && <Icon size={14} className="shrink-0 text-faint" strokeWidth={1.75} aria-hidden />}
      </div>
      {value === null || value === undefined
        ? <div className="mt-2.5 mb-1 skeleton h-6 w-24" aria-label="Loading" />
        : <div className="stat-value truncate">{value}{unit && <span className="ml-1 text-[13px] font-normal text-faint">{unit}</span>}</div>}
      <div className={`mt-1 min-h-[16px] text-[12px] ${hintTone} truncate`}>{hint}</div>
    </>
  )
  // Each cell draws its own top and left hairline; the card clips the outer edge.
  const cls = '-ml-px -mt-px min-w-0 grow basis-[10.5rem] border-l border-t border-line px-4 py-3.5'
  if (href) return <a href={href} className={`${cls} block transition-colors hover:bg-surface-alt`}>{body}</a>
  return <div className={cls}>{body}</div>
}

export function Card({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {description && <p className="meta mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'badge-neutral',
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  accent: 'badge-accent',
}
const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-gray-400',
  info: 'bg-brand-600',
  success: 'bg-success-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
  accent: 'bg-brand-600',
}

// Every status string used across modules maps to one tone here, so the same
// word always carries the same colour.
// Every status string used across modules maps to one tone here, so the same
// word always carries the same colour. Amber is reserved for "someone needs to
// act", red for problems; work in flight uses ink (info).
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  sent: 'info',
  approved: 'success',
  rejected: 'danger',
  scheduled: 'neutral',
  in_progress: 'info',
  'in progress': 'info',
  completed: 'success',
  invoiced: 'success',
  paid: 'success',
  on_hold: 'warning',
  cancelled: 'neutral',
  canceled: 'neutral',
  pending: 'warning',
  received: 'success',
  partial: 'warning',
  ordered: 'info',
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
  denied: 'danger',
  lead: 'info',
  prospect: 'info',
  in: 'success',
  out: 'neutral',
  adjustment: 'neutral',
  high: 'warning',
  urgent: 'danger',
  normal: 'neutral',
  low: 'neutral',
  vip: 'success',
  blacklisted: 'danger',
}

export function toneFor(status: string | null | undefined): Tone {
  return STATUS_TONE[String(status ?? '').toLowerCase()] ?? 'neutral'
}

export function humanize(s: string | null | undefined): string {
  const v = String(s ?? '').replace(/[_-]+/g, ' ').trim()
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—'
}

export function Badge({ tone = 'neutral', dot = false, children, className = '' }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`${TONE_CLASS[tone]} ${dot && tone === 'neutral' ? 'badge-dot' : ''} ${className}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, label, className = '' }: { status: string | null | undefined; label?: ReactNode; className?: string }) {
  const tone = toneFor(status)
  return <Badge tone={tone} dot className={className}>{label ?? humanize(status)}</Badge>
}

export function statusDot(status: string | null | undefined) {
  return TONE_DOT[toneFor(status)]
}

/** One empty state. Says whether nothing exists yet or filters are hiding rows,
 *  and offers the next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 px-4 text-center ${compact ? 'py-8' : 'py-12'}`}>
      {Icon && <Icon size={18} strokeWidth={1.75} className="mb-1.5 text-faint" aria-hidden />}
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-[13px] text-faint">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function LoadingRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 h-12">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="skeleton h-3" style={{ width: j === 0 ? '28%' : `${12 + ((i + j) % 3) * 4}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="page">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-3.5 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card p-4 space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="card">
        <LoadingRows />
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  )
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials || '?'}
    </span>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative w-full sm:max-w-xs ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input type="search" className="input pl-8" {...props} />
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`inline-flex items-start gap-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
      {(label || description) && (
        <span className="leading-tight">
          {label && <span className="block text-[13px] font-medium text-gray-900">{label}</span>}
          {description && <span className="block text-xs text-gray-500 mt-0.5">{description}</span>}
        </span>
      )}
    </label>
  )
}

// Radio-card group for choosing one of a few named options with a short note.
export function OptionCards<T extends string>({
  value,
  onChange,
  options,
  columns = 'grid-cols-2 sm:grid-cols-3',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; note?: ReactNode }[]
  columns?: string
}) {
  return (
    <div role="radiogroup" className={`grid gap-2 ${columns}`}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`relative rounded-md border px-3 py-2.5 text-left transition-colors ${
              on ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className={`block text-[13px] font-medium ${on ? 'text-brand-800' : 'text-gray-900'}`}>{o.label}</span>
            {o.note && <span className={`mt-0.5 block text-xs ${on ? 'text-brand-700/80' : 'text-gray-500'}`}>{o.note}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Guidance: where a record is in its lifecycle, and what to do next          */
/* ------------------------------------------------------------------------- */

export type StepState = 'done' | 'current' | 'upcoming' | 'problem'

export function Stepper({ steps }: { steps: { label: ReactNode; state: StepState }[] }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto text-xs" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={i} className="flex shrink-0 items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          {i > 0 && <span className={`h-px w-5 sm:w-8 ${s.state === 'upcoming' ? 'bg-gray-200' : 'bg-gray-400'}`} aria-hidden />}
          <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold ${
            s.state === 'done' ? 'bg-brand-600 text-white'
              : s.state === 'current' ? 'bg-white text-brand-700 ring-[1.5px] ring-brand-600'
                : s.state === 'problem' ? 'bg-white text-red-600 ring-[1.5px] ring-red-500'
                  : 'bg-white text-gray-400 ring-1 ring-gray-300'
          }`}>
            {s.state === 'done'
              ? <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
              : s.state === 'problem' ? '!' : i + 1}
          </span>
          <span className={s.state === 'current' || s.state === 'problem' ? 'font-medium text-gray-900' : s.state === 'done' ? 'text-gray-700' : 'text-gray-400'}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

// The one thing to do next on a record, with the action to do it. Every
// lifecycle screen (quote, project) leads with this so users never have to
// work out the process themselves.
export function NextStep({
  steps,
  title,
  description,
  actions,
  tone = 'default',
  className = '',
}: {
  steps?: { label: ReactNode; state: StepState }[]
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  tone?: 'default' | 'attention' | 'done'
  className?: string
}) {
  const eyebrow = tone === 'done' ? 'All set' : tone === 'attention' ? 'Needs attention' : 'Next step'
  const eyebrowCls = tone === 'attention' ? 'text-amber-700' : tone === 'done' ? 'text-success-700' : 'text-brand-700'
  return (
    <section className={`card overflow-hidden ${className}`} aria-label={eyebrow}>
      {steps && (
        <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3">
          <Stepper steps={steps} />
        </div>
      )}
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={`text-2xs font-semibold uppercase tracking-wide ${eyebrowCls}`}>{eyebrow}</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{title}</p>
          {description && <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </section>
  )
}

/** A status pill for page headers: coloured dot plus a short sentence
 *  ("Database online", "4 products below minimum"). Links when it has somewhere to go. */
export function StatusPill({ tone = 'neutral', href, title, children }: {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; href?: string; title?: string; children: ReactNode
}) {
  const cls = {
    success: 'bg-success-soft text-success ring-success-line', warning: 'bg-warning-soft text-warning ring-warning-line',
    danger: 'bg-danger-soft text-danger ring-danger-line', info: 'bg-info-soft text-info ring-info-line', neutral: 'bg-surface-alt text-muted ring-line',
  }[tone]
  const dot = { success: 'bg-success-fill', warning: 'bg-warning-fill', danger: 'bg-danger-fill', info: 'bg-info-fill', neutral: 'bg-line-hover' }[tone]
  const body = <><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />{children}</>
  const base = `inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[13px] font-medium ring-1 ring-inset ${cls}`
  return href
    ? <a href={href} title={title} className={`${base} transition-[filter] hover:brightness-[0.97]`}>{body}</a>
    : <span title={title} className={base}>{body}</span>
}
