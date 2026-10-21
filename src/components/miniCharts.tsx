import type { ReactNode } from 'react'

// Small dependency-free charts. HTML columns rather than a stretched SVG, so
// labels keep their real proportions at every width; no chart library is loaded.
// Series use the brand ink; a second series uses the neutral line colour.
const BRAND = '#18181b'
const NEUTRAL = '#d5d9e0'

/** ₹950, ₹12K, ₹3.4L, ₹1.2Cr: Indian compact money for chart labels. */
export function compactINR(v: number): string {
  const n = Math.abs(Number(v) || 0)
  const sign = v < 0 ? '−' : ''
  const trim = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ''))
  if (n >= 1e7) return `${sign}₹${trim(n / 1e7)}Cr`
  if (n >= 1e5) return `${sign}₹${trim(n / 1e5)}L`
  if (n >= 1e3) return `${sign}₹${trim(n / 1e3)}K`
  return `${sign}₹${Math.round(n)}`
}

/** A card that frames a chart; fills its grid cell so side-by-side cards match. */
export function ChartCard({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex h-full w-full flex-col">
      <div className="flex min-h-[48px] items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0"><h2 className="card-title">{title}</h2>{subtitle && <p className="meta mt-0.5">{subtitle}</p>}</div>
        {actions}
      </div>
      <div className="flex-1 px-4 pb-4 pt-2">{children}</div>
    </section>
  )
}

const empty = (h = 160) => <div className="grid place-items-center text-[13px] text-faint" style={{ height: h }}>No data for this period</div>

export function Bars({ data, height = 190, format = compactINR, color = BRAND }: {
  data: { label: string; value: number; hint?: string }[]; height?: number; format?: (n: number) => string; color?: string
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  if (!data.length || data.every(d => !d.value)) return empty(height)
  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={data.map(d => `${d.label} ${format(d.value)}`).join(', ')}>
      {data.map((d, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.hint ?? d.label}: ${format(d.value)}`}>
          <span className="hidden text-[11px] tabular-nums text-muted sm:inline">{d.value ? format(d.value) : ''}</span>
          <div className="w-full max-w-10 rounded-t-[3px] transition-[height]" style={{ height: `${Math.max(d.value ? 2 : 0, (d.value / max) * (height - 40))}px`, background: color, opacity: 0.88 }} />
          <span className="w-full truncate text-center text-[11px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function HBars({ data, format = (n: number) => n.toLocaleString('en-IN'), limit = 8, tone }: {
  data: { label: string; value: number }[]; format?: (n: number) => string; limit?: number; tone?: (label: string) => string
}) {
  const rows = data.slice(0, limit)
  const max = Math.max(1, ...rows.map(d => d.value))
  if (!rows.length) return empty()
  return (
    <div className="space-y-2.5">
      {rows.map(d => (
        <div key={d.label} className="text-[12px]">
          <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words text-muted">{d.label}</span><span className="shrink-0 font-medium tabular-nums text-ink">{format(d.value)}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-track"><div className={`h-1.5 rounded-full ${tone?.(d.label) ?? ''}`} style={{ width: `${(d.value / max) * 100}%`, background: tone ? undefined : BRAND, opacity: tone ? 1 : 0.85 }} /></div>
        </div>
      ))}
    </div>
  )
}

/** Two values per category side by side: the first neutral, the second in the brand (quoted vs won). */
export function PairBars({ data, names, height = 200, format = compactINR }: {
  data: { label: string; a: number; b: number }[]; names: [string, string]; height?: number; format?: (n: number) => string
}) {
  const max = Math.max(1, ...data.flatMap(d => [d.a, d.b]))
  if (!data.length || data.every(d => !d.a && !d.b)) return empty(height)
  const bar = (v: number, bg: string, name: string, label: string) => (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${label} ${name}: ${format(v)}`}>
      <span className="hidden text-[10px] tabular-nums text-muted lg:inline">{v ? format(v) : ''}</span>
      <div className="w-full max-w-6 rounded-t-[3px]" style={{ height: `${Math.max(v ? 2 : 0, (v / max) * (height - 56))}px`, background: bg }} />
    </div>
  )
  return (
    <div>
      <div className="mb-2 flex gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEUTRAL }} />{names[0]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BRAND }} />{names[1]}</span>
      </div>
      <div className="flex items-end gap-1.5 sm:gap-3" style={{ height }} role="img" aria-label={data.map(d => `${d.label}: ${names[0]} ${format(d.a)}, ${names[1]} ${format(d.b)}`).join('; ')}>
        {data.map(d => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-end gap-0.5">{bar(d.a, NEUTRAL, names[0], d.label)}{bar(d.b, BRAND, names[1], d.label)}</div>
            <span className="mt-1 truncate text-center text-[11px] text-faint">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One bar split into parts, with a legend: share of a whole (quotes by status). */
export function Split({ parts, format = (n: number) => n.toLocaleString('en-IN') }: {
  parts: { label: string; value: number; color: string }[]; format?: (n: number) => string
}) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (!total) return empty(120)
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-track">{parts.map(p => <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${format(p.value)}`} />)}</div>
      <div className="mt-3 grid gap-1.5">
        {parts.map(p => (
          <div key={p.label} className="flex items-center gap-2 text-[12px]">
            <span className={`h-2.5 w-2.5 rounded-sm ${p.color}`} /><span className="text-muted">{p.label}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">{format(p.value)}</span>
            <span className="w-10 text-right tabular-nums text-faint">{Math.round((p.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The last n months as { key: '2026-10', label: 'Oct' }, oldest first (India time). */
export function lastMonths(n = 12) {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000)
  const out: { key: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }) })
  }
  return out
}
