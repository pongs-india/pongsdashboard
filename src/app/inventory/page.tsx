'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, ShoppingCart } from 'lucide-react'
import { PageHeader, Stat, StatGrid, EmptyState, PageLoading } from '@/components/ui'
import { ChartCard, Bars, HBars, compactINR, lastMonths } from '@/components/miniCharts'
import { DataTable, type Col } from '@/components/DataTable'
import { fmtINR } from '@/lib/format'
import { stockState } from '@/lib/inventory'

interface Stats {
  purchases: { total: number; last30Days: number; totalAmount: number; last30DaysAmount: number; byMonth: { month: string; amount: number }[] }
  productCounts: Record<string, number>
  totalProducts: number
  stockValue: number
  lowStockCount: number
}
type Product = { id: string; name: string; sku: string; category: string; unit: string; current_stock: number; min_stock: number; cost_price: number }

export default function InventoryDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory/stats').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      fetch('/api/inventory/products').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([s, p]) => { setStats(s); setProducts(Array.isArray(p) ? p : []); setError(''); setLoading(false) })
      .catch(e => { setError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const low = useMemo(() => products
    .map(p => ({ ...p, state: stockState(Number(p.current_stock), Number(p.min_stock)), cover: Number(p.min_stock) > 0 ? Number(p.current_stock) / Number(p.min_stock) : 99 }))
    .filter(p => p.state !== 'ok'), [products])
  const valueByCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of products) { const c = p.category || 'Uncategorised'; m[c] = (m[c] ?? 0) + Number(p.current_stock || 0) * Number(p.cost_price || 0) }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [products])

  if (loading) return <PageLoading />
  if (!stats) {
    return (
      <div className="page">
        <PageHeader title="Inventory" description="Stock on hand, purchasing and items that need reordering." />
        <div className="alert-error" role="alert"><span><span className="font-medium">Inventory figures could not be loaded.</span> {error} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div>
      </div>
    )
  }

  // Always plot the trailing 12 months so empty months read as zero, not as gaps.
  const spend = Object.fromEntries(stats.purchases.byMonth.map(m => [m.month, m.amount]))
  const months = lastMonths(12).map(m => ({ label: m.label, value: Number(spend[m.key] ?? 0), hint: m.key }))
  const counts = Object.entries(stats.productCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  const cols: Col[] = [
    { key: 'name', label: 'Product', sub: { key: 'sku', label: 'SKU', mono: true }, render: r => <a href={`/inventory/products/${r.id}`}>{String(r.name)}</a> },
    { key: 'current_stock', label: 'In stock', kind: 'number', render: r => <span className={r.state === 'out' ? 'font-semibold text-danger' : ''}>{Number(r.current_stock).toLocaleString('en-IN')} <span className="text-[12px] font-normal text-faint">{String(r.unit ?? '')}</span></span> },
    { key: 'min_stock', label: 'Minimum', kind: 'number' },
    { key: 'cover', label: 'Level', noExport: true, className: 'w-[30%]', render: r => {
      const pct = Math.min(100, Number(r.cover) * 100)
      return <div className="h-1.5 rounded-full bg-track"><div className={`h-1.5 rounded-full ${pct < 50 ? 'bg-danger-fill' : 'bg-warning-fill'}`} style={{ width: `${pct}%` }} /></div>
    } },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        description="Stock on hand, purchasing and items that need reordering."
        actions={
          <>
            <a href="/inventory/movements" className="btn-secondary">Record movement</a>
            <a href="/inventory/purchases?new=1" className="btn-primary"><ShoppingCart size={14} /> New purchase</a>
          </>
        }
      />

      <StatGrid>
        <Stat label="Stock value" value={fmtINR(stats.stockValue ?? 0)} hint="On hand, at cost price" />
        <Stat label="Products" value={stats.totalProducts} hint={`${counts.length} categories`} href="/inventory/products" />
        <Stat label="Below minimum" value={stats.lowStockCount ?? 0} tone={(stats.lowStockCount ?? 0) > 0 ? 'warning' : 'neutral'}
          hint={(stats.lowStockCount ?? 0) > 0 ? 'Need reordering' : 'All stocked'} href="/inventory/reorder" />
        <Stat label="Purchases, last 30 days" value={fmtINR(stats.purchases.last30DaysAmount)}
          hint={`${stats.purchases.last30Days} of ${stats.purchases.total} orders · ${fmtINR(stats.purchases.totalAmount)} all time`} href="/inventory/purchases" />
      </StatGrid>

      <div className="grid-equal lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Purchase spend by month" subtitle="Value of purchase orders, last 12 months"
            actions={<a href="/inventory/purchases" className="card-link">Purchases</a>}>
            <Bars data={months} />
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Stock value by category" subtitle="On hand, at cost" actions={<a href="/inventory/products" className="card-link">Products</a>}>
            {valueByCat.length ? <HBars data={valueByCat} format={compactINR} /> : (
              <EmptyState icon={Package} title="No products yet" description="Add the fabric, profiles and lighting you stock."
                action={<a href="/inventory/products?new=1" className="btn-secondary btn-sm">Add product</a>} compact />
            )}
          </ChartCard>
        </div>
      </div>

      <div className="grid-equal lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable
            title="Below minimum stock"
            exportTitle="Below minimum stock"
            cols={cols}
            rows={low as unknown as Record<string, unknown>[]}
            rowHref={r => `/inventory/products/${r.id}`}
            initialSort={{ key: 'cover', dir: 1 }}
            hideSearch
            pageSize={8}
            toolbar={<a href="/inventory/reorder" className="btn-secondary btn-sm">Reorder list</a>}
            empty={{ icon: Package, title: 'Every product is above its minimum', description: 'Nothing needs reordering right now.' }}
          />
        </div>
        <div>
          <ChartCard title="Products by category" subtitle="Number of products">
            <HBars data={counts} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
