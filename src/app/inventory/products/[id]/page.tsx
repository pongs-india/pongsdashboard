import { notFound } from 'next/navigation'
import DocumentTitle from '@/components/DocumentTitle'
import { ArrowLeftRight } from 'lucide-react'
import { dbGetProduct } from '@/lib/db'
import { fmtINR, fmtDate } from '@/lib/format'
import { stockState, STOCK_LABEL, STOCK_TONE } from '@/lib/inventory'
import { Badge, EmptyState } from '@/components/ui'
import ProductMovementButton from './ProductMovementButton'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const product = (await dbGetProduct(params.id)) as (Row & { movements: Row[] }) | null
  if (!product) notFound()

  const movements = product.movements ?? []
  const currentStock = Number(product.current_stock ?? 0)
  const costPrice = Number(product.cost_price ?? 0)
  const sellPrice = Number(product.sell_price ?? 0)
  const minStock = Number(product.min_stock ?? 0)
  const unit = String(product.unit ?? '')
  const st = stockState(currentStock, minStock)
  const margin = costPrice > 0 && sellPrice > 0 ? ((sellPrice - costPrice) / costPrice) * 100 : null

  // Running balance of the movement log (movements are oldest-first from db).
  let bal = 0
  type MovRow = Row & { type: string; qty: number; balance: number }
  const withBalance: MovRow[] = movements.map(m => {
    const qty = Number(m.quantity ?? 0)
    const type = String(m.movement_type ?? 'IN').toUpperCase()
    bal += type === 'OUT' ? -qty : qty
    return { ...m, type, qty, balance: bal }
  }).reverse() // newest first for display

  return (
    <div className="page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STOCK_TONE[st]} dot>{STOCK_LABEL[st]}</Badge>
            {product.sku ? <span className="mono text-xs text-gray-500">{String(product.sku)}</span> : null}
          </div>
          <DocumentTitle title={String(String(product.name))} />
          <h1 className="mt-2 text-xl sm:text-[22px] font-semibold tracking-tight text-gray-900">{String(product.name)}</h1>
          <p className="mt-1 text-[13px] text-gray-500">{String(product.category || 'Uncategorised')}{unit ? ` · counted in ${unit}` : ''}</p>
        </div>
        <ProductMovementButton productId={String(product.id)} productName={String(product.name)} />
      </div>

      <section className="card mb-6">
        <dl className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <div className="px-5 py-4">
            <dt className="text-xs font-medium text-gray-500">In stock</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{currentStock.toLocaleString('en-IN')} <span className="text-sm font-normal text-gray-500">{unit}</span></dd>
            <dd className={`mt-0.5 text-xs ${st === 'out' ? 'text-red-700' : st === 'low' ? 'text-amber-700' : 'text-gray-500'}`}>
              {minStock > 0 ? `Minimum ${minStock} ${unit}` : 'No minimum set'}
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-xs font-medium text-gray-500">Cost price</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(costPrice)}</dd>
            <dd className="mt-0.5 text-xs text-gray-500">Per {unit || 'unit'}</dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-xs font-medium text-gray-500">Sell price</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(sellPrice)}</dd>
            <dd className="mt-0.5 text-xs text-gray-500">{margin !== null ? `${margin.toFixed(0)}% over cost` : 'Per unit'}</dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-xs font-medium text-gray-500">Stock value</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(currentStock * costPrice)}</dd>
            <dd className="mt-0.5 text-xs text-gray-500">At cost</dd>
          </div>
        </dl>
        {product.notes ? <p className="border-t border-gray-100 px-5 py-3 text-[13px] text-gray-600">{String(product.notes)}</p> : null}
      </section>

      <section className="table-wrap">
        <div className="card-header">
          <h2 className="card-title">Movement history</h2>
          <span className="text-xs text-gray-500">{withBalance.length} movement{withBalance.length !== 1 ? 's' : ''}</span>
        </div>
        {withBalance.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="No movements recorded" description="Stock received or issued for this product will be listed here." compact />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Direction</th><th className="hidden sm:table-cell">Reference</th><th className="num">Quantity</th><th className="num">Running total</th><th className="hidden md:table-cell">Notes</th></tr>
              </thead>
              <tbody>
                {withBalance.map(m => (
                  <tr key={String(m.id)}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(String(m.movement_date ?? m.created_at ?? ''))}</td>
                    <td><Badge tone={m.type === 'OUT' ? 'danger' : 'success'}>{m.type === 'OUT' ? 'Issued' : 'Received'}</Badge></td>
                    <td className="hidden sm:table-cell text-gray-600">{String(m.reference_type || '—')}{m.reference_id ? <span className="mono text-xs text-gray-500"> #{String(m.reference_id).slice(0, 8)}</span> : null}</td>
                    <td className="num font-medium text-gray-900">{m.type === 'OUT' ? '−' : '+'}{m.qty}</td>
                    <td className="num">{m.balance}</td>
                    <td className="hidden md:table-cell text-gray-500">{String(m.notes || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
