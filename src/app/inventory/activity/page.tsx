'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows } from '@/components/ui'
import { fmtINR, fmtDate } from '@/lib/format'

interface ActivityItem {
  id: string; kind: 'purchase' | 'in' | 'out'; title: string; date: string; details: string; href?: string
}

const ICON = {
  purchase: { icon: ShoppingCart, cls: 'bg-gray-100 text-gray-700' },
  in: { icon: ArrowDownLeft, cls: 'bg-brand-50 text-brand-700' },
  out: { icon: ArrowUpRight, cls: 'bg-gray-100 text-gray-700' },
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'purchase' | 'movement'>('all')

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
    }).catch(() => setLoading(false))
  }, [])

  const filtered = activity.filter(a => filter === 'all' || (filter === 'purchase' ? a.kind === 'purchase' : a.kind !== 'purchase'))
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
        actions={
          <div className="segmented">
            <button data-active={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            <button data-active={filter === 'purchase'} onClick={() => setFilter('purchase')}>Purchases</button>
            <button data-active={filter === 'movement'} onClick={() => setFilter('movement')}>Movements</button>
          </div>
        }
      />

      <div className="card max-w-4xl">
        {loading ? <LoadingRows rows={6} cols={3} /> : groups.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" description="Purchases and stock movements will appear here." />
        ) : groups.map(g => (
          <div key={g.day}>
            <p className="sticky top-14 z-10 border-b border-gray-100 bg-gray-50/95 px-5 py-2 text-xs font-medium text-gray-500 backdrop-blur first:rounded-t-lg">{fmtDate(g.day)}</p>
            <ul className="divide-y divide-gray-100">
              {g.items.map(item => {
                const { icon: Icon, cls } = ICON[item.kind]
                const body = (
                  <>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${cls}`}><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-900">{item.title}</span>
                      <span className="block truncate text-xs text-gray-500">{item.details}</span>
                    </span>
                  </>
                )
                return (
                  <li key={item.id}>
                    {item.href
                      ? <a href={item.href} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">{body}</a>
                      : <div className="flex items-center gap-3 px-5 py-3">{body}</div>}
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
