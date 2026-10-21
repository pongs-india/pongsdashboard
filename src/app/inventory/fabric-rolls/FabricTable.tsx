'use client'
import { useMemo } from 'react'
import { Layers } from 'lucide-react'
import { Badge } from '@/components/ui'
import { stockState, STOCK_LABEL, STOCK_TONE } from '@/lib/inventory'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect } from '@/components/filters'

type Row = Record<string, unknown>
const RANK: Record<string, number> = { out: 0, low: 1, ok: 2 }

export default function FabricTable({ rolls }: { rolls: Row[] }) {
  const flt = useFilters({ stock: '' })
  const maxStock = Math.max(1, ...rolls.map(p => Math.max(Number(p.current_stock ?? 0), Number(p.min_stock ?? 0) * 2)))
  const rows = useMemo(() => rolls.map(p => {
    const stock = Number(p.current_stock ?? 0), min = Number(p.min_stock ?? 0)
    return { ...p, state: stockState(stock, min), value: stock * Number(p.cost_price ?? 0) }
  }).filter(p => !flt.values.stock || (flt.values.stock === 'attention' ? ['out', 'low'].includes(p.state) : p.state === flt.values.stock)), [rolls, flt.values.stock])

  const cols: Col[] = [
    { key: 'name', label: 'Fabric', sub: { key: 'sku', label: 'SKU', mono: true }, render: r => <a href={`/inventory/products/${r.id}`}>{String(r.name)}</a> },
    { key: 'current_stock', label: 'In stock', kind: 'number', total: true, render: r => <span className="whitespace-nowrap"><span className="font-medium">{Number(r.current_stock ?? 0).toLocaleString('en-IN')}</span> <span className="text-[12px] text-faint">{String(r.unit ?? 'm')}</span></span> },
    { key: 'min_stock', label: 'Minimum', kind: 'number', hideBelow: 'sm' },
    { key: 'level', label: 'Level against minimum', noSort: true, noExport: true, hideBelow: 'md', className: 'w-[28%]', render: r => {
      const stock = Number(r.current_stock ?? 0), min = Number(r.min_stock ?? 0)
      return (
        <div className="relative h-1.5 rounded-full bg-track">
          <div className={`h-1.5 rounded-full ${r.state === 'ok' ? 'bg-success-fill' : 'bg-warning-fill'}`} style={{ width: `${Math.min(100, (stock / maxStock) * 100)}%` }} />
          {min > 0 && <span className="absolute -top-1 h-3.5 w-px bg-muted" style={{ left: `${Math.min(100, (min / maxStock) * 100)}%` }} title={`Minimum ${min}`} />}
        </div>
      )
    } },
    { key: 'state', label: 'Status', value: r => STOCK_LABEL[r.state as keyof typeof STOCK_LABEL], sortValue: r => RANK[String(r.state)] ?? 3,
      render: r => <Badge tone={STOCK_TONE[r.state as keyof typeof STOCK_TONE]} dot>{STOCK_LABEL[r.state as keyof typeof STOCK_LABEL]}</Badge> },
    { key: 'value', label: 'Value at cost', kind: 'money', total: true, hideBelow: 'lg' },
  ]

  return (
    <DataTable
      title="Fabric on hand"
      exportTitle="Fabric rolls"
      cols={cols}
      rows={rows}
      rowHref={r => `/inventory/products/${r.id}`}
      initialSort={{ key: 'state', dir: 1 }}
      searchPlaceholder="Search fabric or SKU"
      filters={<FilterSelect value={flt.values.stock} onChange={x => flt.set({ stock: x })} all="Any stock level" className="w-full sm:w-48"
        options={[{ value: 'attention', label: 'Needs attention' }, { value: 'out', label: 'Out of stock' }, { value: 'low', label: 'Below minimum' }, { value: 'ok', label: 'In stock' }]} />}
      filtersActive={flt.active}
      onClearFilters={flt.clear}
      summary={() => 'The tick on each bar marks the minimum stock level.'}
      empty={{ icon: Layers, title: 'No fabric products', description: 'Products whose category contains Fabric are tracked here.',
        action: <a href="/inventory/products" className="btn-secondary btn-sm">Go to products</a> }}
    />
  )
}
