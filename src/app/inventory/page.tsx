'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { AlertTriangle, Package, ShoppingCart } from 'lucide-react'
import { PageHeader, Stat, StatGrid, EmptyState, PageLoading } from '@/components/ui'
import { ChartCard, ChartEmpty, ChartTooltip, CHART_PRIMARY, AXIS_TICK, GRID_STROKE, CURSOR_FILL, BAR_MAX, BAR_RADIUS, compactINR, fullINR } from '@/components/charts'
import { fmtINR, fmtMonth } from '@/lib/format'
import { navigate } from '@/lib/navigate'

interface Stats {
  purchases: {
    total: number
    last30Days: number
    totalAmount: number
    last30DaysAmount: number
    byMonth: { month: string; amount: number }[]
  }
  productCounts: Record<string, number>
  totalProducts: number
  stockValue: number
  lowStockCount: number
}

type LowItem = { id: string; name: string; current_stock: number; min_stock: number }

export default function InventoryDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [low, setLow] = useState<LowItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/inventory/stats').then(r => r.json()),
      fetch('/api/notifications').then(r => r.json()).catch(() => ({ lowStock: [] })),
    ]).then(([s, n]) => { setStats(s); setLow(n?.lowStock ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />
  if (!stats) {
    return <div className="card mt-8"><EmptyState icon={Package} title="Inventory figures could not be loaded" description="Refresh the page to try again." /></div>
  }

  // Always plot the trailing 12 months so empty months read as zero, not as gaps.
  const spend = Object.fromEntries(stats.purchases.byMonth.map(m => [m.month, m.amount]))
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { month, amount: spend[month] ?? 0, label: fmtMonth(month + '-01', true).split(' ')[0] }
  })
  const hasSpend = months.some(m => m.amount > 0)
  const categories = Object.entries(stats.productCounts).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(1, ...categories.map(c => c[1]))

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        description="Stock on hand, purchasing and items that need reordering."
        actions={
          <>
            <a href="/inventory/movements" className="btn-secondary">Record movement</a>
            <a href="/inventory/purchases" className="btn-primary"><ShoppingCart size={14} /> New purchase</a>
          </>
        }
      />

      <StatGrid>
        <Stat label="Stock value" value={fmtINR(stats.stockValue ?? 0)} hint="At cost price" />
        <Stat label="Products" value={stats.totalProducts} hint={`${categories.length} categories`} href="/inventory/products" />
        <Stat label="Below minimum" value={stats.lowStockCount ?? 0} tone={(stats.lowStockCount ?? 0) > 0 ? 'warning' : 'neutral'}
          hint={(stats.lowStockCount ?? 0) > 0 ? 'Need reordering' : 'All stocked'} href="/inventory/reorder" />
        <Stat label="Purchases, last 30 days" value={fmtINR(stats.purchases.last30DaysAmount)}
          hint={`${stats.purchases.last30Days} of ${stats.purchases.total} orders · ${fmtINR(stats.purchases.totalAmount)} all time`} href="/inventory/purchases" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Purchase spend by month"
          description="Total value of purchase orders, last 12 months"
          table={{ columns: ['Month', 'Amount'], rows: months.map(m => [fmtMonth(m.month + '-01'), fullINR(m.amount)]), alignRight: [1] }}
        >
          {!hasSpend ? <ChartEmpty>No purchases in the last 12 months.</ChartEmpty> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={compactINR} width={52} />
                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip />} />
                <Bar dataKey="amount" name="Spend" fill={CHART_PRIMARY} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Products by category</h2>
            <a href="/inventory/products" className="card-link">All products</a>
          </div>
          {categories.length === 0 ? <EmptyState icon={Package} title="No products yet" description="Add the fabric, profiles and lighting you stock to track levels and reorders."
            action={<a href="/inventory/products?new=1" className="btn-secondary btn-sm">Add product</a>} compact /> : (
            <ul className="space-y-3 p-5">
              {categories.map(([cat, count]) => (
                <li key={cat}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="truncate text-gray-800">{cat}</span>
                    <span className="tabular-nums text-gray-500">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${(count / maxCat) * 100}%`, background: CHART_PRIMARY }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="table-wrap mt-4">
        <div className="card-header">
          <h2 className="card-title">Below minimum stock</h2>
          <a href="/inventory/reorder" className="card-link">Reorder list</a>
        </div>
        {low.length === 0 ? (
          <EmptyState icon={Package} title="Every product is above its minimum" compact />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th>Product</th><th className="num">In stock</th><th className="num">Minimum</th><th className="w-[30%]">Level</th></tr></thead>
              <tbody>
                {low.slice(0, 8).map(p => {
                  const pct = p.min_stock > 0 ? Math.min(100, (p.current_stock / p.min_stock) * 100) : 0
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/inventory/products/${p.id}`, e)}>
                      <td className="font-medium text-gray-900"><span className="inline-flex items-center gap-2"><AlertTriangle size={14} className={p.current_stock <= 0 ? 'text-red-600' : 'text-amber-600'} />{p.name}</span></td>
                      <td className="num">{p.current_stock}</td>
                      <td className="num text-gray-500">{p.min_stock}</td>
                      <td>
                        <div className="h-1.5 rounded-full bg-gray-100">
                          <div className={`h-1.5 rounded-full ${pct < 50 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
