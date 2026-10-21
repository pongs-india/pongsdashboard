'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { PageHeader, Badge, Stat, StatGrid } from '@/components/ui'
import { fmtINR } from '@/lib/format'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, optionsFrom } from '@/components/filters'

type Product = { id: string; name: string; sku: string; category: string; unit: string; current_stock: number; min_stock: number; cost_price: number; supplier_id: string }

export default function ReorderPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const f = useFilters({ category: '', supplier: '', severity: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory/products').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      fetch('/api/inventory/suppliers').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([d, s]) => {
      setProducts((Array.isArray(d) ? d : []).filter((p: Product) => Number(p.min_stock) > 0 && Number(p.current_stock) <= Number(p.min_stock)))
      setSuppliers(Object.fromEntries((Array.isArray(s) ? s : []).map((x: { id: string; name: string }) => [x.id, x.name])))
      setLoadError('')
      setLoading(false)
    }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => products.map(p => {
    const deficit = Math.max(0, Number(p.min_stock) - Number(p.current_stock))
    return { ...p, supplier: suppliers[p.supplier_id] ?? '', shortfall: deficit, cost_to_min: deficit * Number(p.cost_price || 0), cover: Number(p.current_stock) / Math.max(1, Number(p.min_stock)), state: Number(p.current_stock) <= 0 ? 'out' : 'low' }
  }).filter(p => (!v.category || p.category === v.category) && (!v.supplier || p.supplier === v.supplier) && (!v.severity || p.state === v.severity)),
  [products, suppliers, v])

  const out = rows.filter(p => p.state === 'out').length
  const cols: Col[] = [
    { key: 'name', label: 'Product', sub: { key: 'sku', label: 'SKU', mono: true }, render: r => <a href={`/inventory/products/${r.id}`}>{String(r.name)}</a> },
    { key: 'category', label: 'Category', hideBelow: 'md' },
    { key: 'supplier', label: 'Supplier', hideBelow: 'lg' },
    { key: 'current_stock', label: 'In stock', kind: 'number', render: r => <span className={r.state === 'out' ? 'font-semibold text-danger' : ''}>{Number(r.current_stock).toLocaleString('en-IN')} <span className="text-[12px] text-faint">{String(r.unit ?? '')}</span></span> },
    { key: 'min_stock', label: 'Minimum', kind: 'number', hideBelow: 'sm' },
    { key: 'shortfall', label: 'Shortfall', kind: 'number' },
    { key: 'cost_to_min', label: 'Cost to minimum', kind: 'money', total: true, hideBelow: 'sm' },
    { key: 'state', label: 'Status', value: r => (r.state === 'out' ? 'Out of stock' : 'Below minimum'), sortValue: r => Number(r.cover),
      render: r => <Badge tone={r.state === 'out' ? 'danger' : 'warning'} dot>{r.state === 'out' ? 'Out of stock' : 'Below minimum'}</Badge> },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Reorder alerts"
        description="Products at or below their minimum stock level, most urgent first."
        actions={rows.length > 0 ? <a href="/inventory/purchases?new=1" className="btn-primary">Create purchase order</a> : undefined}
      />

      <StatGrid cols={3}>
        <Stat label="Items to reorder" value={loading ? null : rows.length} tone={rows.length ? 'warning' : 'neutral'} hint={loading ? undefined : rows.length ? 'At or below minimum' : 'Nothing to reorder'} />
        <Stat label="Out of stock" value={loading ? null : out} tone={out ? 'danger' : 'neutral'} hint={loading ? undefined : out ? 'Zero units on hand' : 'None'} />
        <Stat label="Cost to reach minimum" value={loading ? null : fmtINR(rows.reduce((s, p) => s + p.cost_to_min, 0))} hint={loading ? undefined : 'Shortfall valued at cost price'} />
      </StatGrid>

      <DataTable
        title="Below minimum"
        exportTitle="Reorder list"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/inventory/products/${r.id}`}
        initialSort={{ key: 'state', dir: 1 }}
        searchPlaceholder="Search product or SKU"
        filters={<>
          <FilterSelect value={v.category} onChange={x => f.set({ category: x })} all="All categories" className="w-full sm:w-48" options={optionsFrom(products, p => p.category)} />
          <FilterSelect value={v.supplier} onChange={x => f.set({ supplier: x })} all="All suppliers" className="w-full sm:w-52" options={optionsFrom(products.map(p => suppliers[p.supplier_id]).filter(Boolean), x => x)} />
          <FilterSelect value={v.severity} onChange={x => f.set({ severity: x })} all="Out or low" className="w-full sm:w-40" options={[{ value: 'out', label: 'Out of stock' }, { value: 'low', label: 'Below minimum' }]} />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        empty={{ icon: PackageCheck, title: 'Every product is above its minimum', description: 'Nothing needs reordering right now.' }}
      />
    </div>
  )
}
