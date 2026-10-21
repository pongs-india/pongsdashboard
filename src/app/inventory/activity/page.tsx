'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows } from '@/components/ui'
import { useFilters, PeriodFilter, resolvePeriod, inPeriod } from '@/components/filters'
import { fmtINR, fmtDate } from '@/lib/format'

interface ActivityItem {
  id: string; kind: 'purchase' | 'in' | 'out'; title: string; date: string; details: string; href?: string
}

const ICON = {
  purchase: { icon: ShoppingCart, cls: 'bg-info-soft text-info' },
  in: { icon: ArrowDownLeft, cls: 'bg-success-soft text-success' },
  out: { icon: ArrowUpRight, cls: 'bg-surface-alt text-muted' },
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const flt = useFilters({ kind: '', period: '3m', from: '', to: '' })
  const fv = flt.values

  useEffect(() => {
    Promise.all([
      fetch('/api/inventory/purchases').then(r => r.json()),
      fetch('/api/inventory/movements').then(r => r.json()),
    ]).then(([purchases, movements]) => {
      const items: ActivityItem[] = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(Array.isArray(purchases) ? purchases : []).map((p: any) => ({
          id: `p-${p.id}`,
          kind: 'purchase' as const,
          title: `Purchase order ${p.purchase_number || ''}`.trim(),
          date: p.purchase_date ?? p.created_at ?? '',
          details: `${p.supplier_name ?? 'Unknown supplier'} · ${fmtINR(Number(p.total_amount))} · ${p.status ?? ''}`,
          href: '/inventory/purchases',
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(Array.isArray(movements) ? movements : []).map((m: any) => ({
          id: `m-${m.id}`,
          kind: (m.movement_type === 'OUT' ? 'out' : 'in') as 'in' | 'out',
          title: `${m.movement_type === 'OUT' ? 'Issued' : 'Received'} ${m.quantity} · ${m.product_name ?? 'Unknown product'}`,
          date: m.movement_date ?? m.created_at ?? '',
          details: [m.reference_type, m.notes].filter(Boolean).join(' · ') || 'No reference',
          href: m.product_id ? `/inventory/products/${m.product_id}` : undefined,
        })),
      ]
      items.sort((a, b) => String(b.date).localeCompare(String(a.date)))
      setActivity(items)
      setLoading(false)
    }).catch(() => { setError('Could not reach the server.'); setLoading(false) })
  }, [])

  const period = resolvePeriod(fv.period, fv.from, fv.to)
  const filtered = activity.filter(a =>
    (!fv.kind || (fv.kind === 'purchase' ? a.kind === 'purchase' : fv.kind === 'in' ? a.kind === 'in' : a.kind === 'out')) && inPeriod(a.date, period))
  // Group by day for a readable feed.
  const groups: { day: string; items: ActivityItem[] }[] = []
  for (const a of filtered) {
    const day = String(a.date).slice(0, 10)
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(a)
    else groups.push({ day, items: [a] })
  }

  return (
    <div className="page">
      <PageHeader
        title="Inventory activity"
        description="Purchases and stock movements, newest first."
      />

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label="Type">
          {[['', 'All'], ['purchase', 'Purchases'], ['in', 'Received'], ['out', 'Issued']].map(([val, l]) => (
            <button key={val} type="button" aria-pressed={fv.kind === val} data-active={fv.kind === val} onClick={() => flt.set({ kind: val })}>{l}</button>
          ))}
        </div>
        <PeriodFilter period={fv.period} from={fv.from} to={fv.to} dateLabel="Date" onChange={x => flt.set(x)} />
      </div>

      <div className="card overflow-hidden">
        <div className="card-head"><h2 className="card-title">Activity</h2>{!loading && <span className="count">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · {period.label}</span>}</div>
        {loading ? <LoadingRows rows={6} cols={3} /> : error ? (
          <div className="p-4"><div className="alert-error" role="alert">{error}</div></div>
        ) : groups.length === 0 ? (
          activity.length
            ? <EmptyState title="Nothing in this period" description="Activity exists, but the filters hide it." action={<button type="button" className="btn-secondary btn-sm" onClick={flt.clear}>Clear filters</button>} />
            : <EmptyState icon={Activity} title="No activity yet" description="Purchases and stock movements will appear here." />
        ) : groups.map(g => (
          <div key={g.day}>
            <p className="sticky top-14 z-10 border-y border-line bg-surface-alt/95 px-4 py-2 text-[12px] font-medium text-faint backdrop-blur first:border-t-0">{fmtDate(g.day)}</p>
            <ul className="divide-y divide-line">
              {g.items.map(item => {
                const { icon: Icon, cls } = ICON[item.kind]
                const body = (
                  <>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls}`}><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{item.title}</span>
                      <span className="block truncate text-[12px] text-faint">{item.details}</span>
                    </span>
                  </>
                )
                return (
                  <li key={item.id}>
                    {item.href
                      ? <a href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt">{body}</a>
                      : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
