'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Select, DatePicker, type SelectOption } from '@/components/controls'

// Filters for every list and dashboard. Values live in the URL (?status=sent&from=2026-04-01)
// so a filtered view can be bookmarked, shared, and survives a refresh.

export type FilterValues = Record<string, string>

export function useFilters<T extends FilterValues>(defaults: T) {
  const [values, setValues] = useState<T>(defaults)
  // Read the URL once on mount (client only).
  useEffect(() => {
    const sp = new URL(window.location.href).searchParams
    const next = { ...defaults }
    for (const k of Object.keys(defaults)) { const v = sp.get(k); if (v !== null) (next as FilterValues)[k] = v }
    setValues(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const write = useCallback((next: T) => {
    const url = new URL(window.location.href)
    for (const k of Object.keys(defaults)) {
      const v = next[k]
      if (!v || v === defaults[k]) url.searchParams.delete(k)
      else url.searchParams.set(k, v)
    }
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = useCallback((patch: Partial<T>) => {
    setValues(prev => { const next = { ...prev, ...patch } as T; write(next); return next })
  }, [write])
  const clear = useCallback(() => { setValues(defaults); write(defaults) }, [defaults, write])
  const active = useMemo(() => Object.keys(defaults).some(k => (values[k] ?? '') !== (defaults[k] ?? '')), [values, defaults])
  return { values, set, clear, active }
}

/** A filter dropdown. The empty value means "all"; its label is the placeholder. */
export function FilterSelect({ value, onChange, options, all, className = 'w-full sm:w-44', ariaLabel }: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  /** Label for "no filter", e.g. "All statuses". */
  all: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select size="sm" className={className} value={value} ariaLabel={ariaLabel ?? all} placeholder={all}
      onChange={v => onChange(String(v))} options={[{ value: '', label: all }, ...options]} />
  )
}

/** Two joined date fields that never wrap apart. The placeholder names the
 *  date being filtered ("Quote date from"), so several ranges stay readable. */
export function DateRange({ label, from, to, onChange, className = '' }: {
  label: string
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}) {
  return (
    <div className={`flex min-w-0 items-center ${className}`} role="group" aria-label={`${label} range`}>
      <DatePicker size="sm" className="min-w-0 flex-1 sm:w-[11.5rem] sm:flex-none [&_button]:rounded-r-none" placeholder={`${label} from`}
        value={from} onChange={v => onChange(v, to)} ariaLabel={`${label} from`} />
      <DatePicker size="sm" className="-ml-px min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none [&_button]:rounded-l-none" placeholder="to"
        value={to} onChange={v => onChange(from, v)} ariaLabel={`${label} to`} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Periods. "Today" is India time; the financial year runs April to March.
// ---------------------------------------------------------------------------

export const PERIODS = [
  ['all', 'All time'],
  ['month', 'This month'],
  ['last', 'Last month'],
  ['3m', 'Last 3 months'],
  ['fy', 'This FY'],
  ['lastfy', 'Last FY'],
] as const
export type PeriodKey = (typeof PERIODS)[number][0] | 'custom'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function resolvePeriod(key: string, from?: string, to?: string): { key: PeriodKey; from: string; to: string; label: string } {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000)
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  const today = iso(now)
  const first = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1))
  const DAY = /^\d{4}-\d{2}-\d{2}$/
  if ((from && DAY.test(from)) || (to && DAY.test(to))) {
    const f = from && DAY.test(from) ? from : '2000-01-01'
    const t = to && DAY.test(to) ? to : today
    return { key: 'custom', from: f, to: t, label: 'Custom range' }
  }
  const fyStart = m >= 3 ? y : y - 1
  switch (key) {
    case 'month': return { key: 'month', from: iso(first(y, m)), to: today, label: 'This month' }
    case 'last': return { key: 'last', from: iso(first(y, m - 1)), to: iso(new Date(first(y, m).getTime() - 864e5)), label: 'Last month' }
    case '3m': return { key: '3m', from: iso(first(y, m - 2)), to: today, label: 'Last 3 months' }
    case 'fy': return { key: 'fy', from: `${fyStart}-04-01`, to: today, label: `FY ${fyStart}–${String(fyStart + 1).slice(2)}` }
    case 'lastfy': return { key: 'lastfy', from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31`, label: `FY ${fyStart - 1}–${String(fyStart).slice(2)}` }
    default: return { key: 'all', from: '', to: '', label: 'All time' }
  }
}

/** True when an ISO date or timestamp falls inside the period (inclusive). Empty period matches everything. */
export function inPeriod(date: unknown, p: { from: string; to: string }) {
  if (!p.from && !p.to) return true
  const d = String(date ?? '').slice(0, 10)
  if (!d) return false
  return (!p.from || d >= p.from) && (!p.to || d <= p.to)
}

/** Preset period tabs plus a custom date range, as one control group. */
export function PeriodFilter({ period, from, to, onChange, dateLabel = 'Date', presets = PERIODS }: {
  period: string
  from: string
  to: string
  onChange: (patch: { period: string; from: string; to: string }) => void
  dateLabel?: string
  presets?: readonly (readonly [string, string])[]
}) {
  const custom = !!(from || to)
  return (
    <>
      <div className="seg seg-sm" role="group" aria-label="Period">
        {presets.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={!custom && period === key} data-active={!custom && period === key}
            onClick={() => onChange({ period: key, from: '', to: '' })}>{label}</button>
        ))}
      </div>
      <DateRange label={dateLabel} from={from} to={to} onChange={(f, t) => onChange({ period, from: f, to: t })} className="w-full sm:w-auto" />
    </>
  )
}

/** Page-level filter row (outside a table card): controls are 36px; Clear appears only when something is set. */
export function FilterBar({ children, active, onClear }: { children: ReactNode; active?: boolean; onClear?: () => void }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {children}
      {active && onClear && <button type="button" className="btn-ghost btn-sm" onClick={onClear}>Clear filters</button>}
    </div>
  )
}

/** Unique, sorted option list from a column of rows. */
export function optionsFrom<T>(rows: T[], get: (r: T) => unknown, label?: (v: string) => string): SelectOption[] {
  const seen = new Set<string>()
  for (const r of rows) { const v = String(get(r) ?? '').trim(); if (v) seen.add(v) }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'en-IN', { numeric: true })).map(v => ({ value: v, label: label ? label(v) : v }))
}
