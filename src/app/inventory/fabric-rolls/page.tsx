export const dynamic = 'force-dynamic'

import { Layers } from 'lucide-react'
import { dbListProducts } from '@/lib/db'
import { PageHeader, Badge, EmptyState, Stat, StatGrid } from '@/components/ui'
import { stockState, STOCK_LABEL, STOCK_TONE } from '@/lib/inventory'
import { fmtINR } from '@/lib/format'

type Row = Record<string, unknown>

export default async function FabricRollsPage() {
  const all = (await dbListProducts()) as unknown as Row[]
  const rolls = all.filter(p => String(p.category ?? '').toLowerCase().includes('fabric'))
  const totalStock = rolls.reduce((s, p) => s + Number(p.current_stock ?? 0), 0)
  const value = rolls.reduce((s, p) => s + Number(p.current_stock ?? 0) * Number(p.cost_price ?? 0), 0)
  const attention = rolls.filter(p => ['out', 'low'].includes(stockState(Number(p.current_stock ?? 0), Number(p.min_stock ?? 0)))).length
  const maxStock = Math.max(1, ...rolls.map(p => Math.max(Number(p.current_stock ?? 0), Number(p.min_stock ?? 0) * 2)))

  return (
    <div className="page">
      <PageHeader title="Fabric rolls" description="Stretch ceiling fabric on hand, by product." />

      <StatGrid cols={3}>
        <Stat label="Fabric products" value={rolls.length} />
        <Stat label="Fabric on hand" value={`${totalStock.toLocaleString('en-IN')}`} hint={`${fmtINR(value)} at cost`} />
        <Stat label="Below minimum" value={attention} tone={attention ? 'warning' : 'neutral'} hint={attention ? 'Reorder soon' : 'All stocked'} href="/inventory/reorder" />
      </StatGrid>

      <div className="table-wrap">
        {rolls.length === 0 ? (
          <EmptyState icon={Layers} title="No fabric products" description="Products whose category contains Fabric are tracked here."
            action={<a href="/inventory/products" className="btn-secondary">Go to products</a>} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th>Fabric</th><th className="hidden sm:table-cell">SKU</th><th className="num">In stock</th><th className="w-[28%] hidden md:table-cell">Level against minimum</th><th>Status</th></tr></thead>
              <tbody>
                {rolls.map(p => {
                  const stock = Number(p.current_stock ?? 0)
                  const min = Number(p.min_stock ?? 0)
                  const st = stockState(stock, min)
                  return (
                    <tr key={String(p.id)}>
                      <td><a href={`/inventory/products/${p.id}`} className="font-medium text-gray-900 hover:underline">{String(p.name)}</a></td>
                      <td className="hidden sm:table-cell mono text-xs text-gray-500">{String(p.sku || '—')}</td>
                      <td className="num whitespace-nowrap"><span className="font-medium text-gray-900">{stock.toLocaleString('en-IN')}</span> <span className="text-xs text-gray-500">{String(p.unit ?? 'm')}</span></td>
                      <td className="hidden md:table-cell">
                        <div className="relative h-1.5 rounded-full bg-gray-100">
                          <div className={`h-1.5 rounded-full ${st === 'out' || st === 'low' ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (stock / maxStock) * 100)}%` }} />
                          {min > 0 && <span className="absolute -top-1 h-3.5 w-px bg-gray-500" style={{ left: `${Math.min(100, (min / maxStock) * 100)}%` }} title={`Minimum ${min}`} />}
                        </div>
                      </td>
                      <td><Badge tone={STOCK_TONE[st]} dot>{STOCK_LABEL[st]}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rolls.length > 0 && <div className="table-footer"><span>The tick on each bar marks the minimum stock level.</span><span>{rolls.length} fabrics</span></div>}
      </div>
    </div>
  )
}
