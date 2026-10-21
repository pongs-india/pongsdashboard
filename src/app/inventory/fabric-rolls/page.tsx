export const dynamic = 'force-dynamic'

import { dbListProducts } from '@/lib/db'
import { PageHeader, Stat, StatGrid } from '@/components/ui'
import FabricTable from './FabricTable'
import { stockState } from '@/lib/inventory'
import { fmtINR } from '@/lib/format'

type Row = Record<string, unknown>

export default async function FabricRollsPage() {
  const all = (await dbListProducts()) as unknown as Row[]
  const rolls = all.filter(p => String(p.category ?? '').toLowerCase().includes('fabric'))
  const totalStock = rolls.reduce((s, p) => s + Number(p.current_stock ?? 0), 0)
  const value = rolls.reduce((s, p) => s + Number(p.current_stock ?? 0) * Number(p.cost_price ?? 0), 0)
  const attention = rolls.filter(p => ['out', 'low'].includes(stockState(Number(p.current_stock ?? 0), Number(p.min_stock ?? 0)))).length

  return (
    <div className="page">
      <PageHeader title="Fabric rolls" description="Stretch ceiling fabric on hand, by product." />

      <StatGrid cols={3}>
        <Stat label="Fabric products" value={rolls.length} hint="Category contains Fabric" />
        <Stat label="Fabric on hand" value={`${totalStock.toLocaleString('en-IN')}`} hint={`${fmtINR(value)} at cost`} />
        <Stat label="Below minimum" value={attention} tone={attention ? 'warning' : 'neutral'} hint={attention ? 'Reorder soon' : 'All stocked'} href="/inventory/reorder" />
      </StatGrid>

      <FabricTable rolls={rolls} />
    </div>
  )
}
