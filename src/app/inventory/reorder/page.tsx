'use client'
import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, Badge, Stat, StatGrid } from '@/components/ui'
import { fmtINR } from '@/lib/format'
import { navigate } from '@/lib/navigate'

type Product = { id: string; name: string; category: string; unit: string; current_stock: number; min_stock: number; cost_price: number; supplier_id: string }

export default function ReorderPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/inventory/products').then(r => r.json()).then(d => {
      const list = (Array.isArray(d) ? d : []).filter((p: Product) => p.min_stock > 0 && p.current_stock <= p.min_stock)
      list.sort((a: Product, b: Product) => (a.current_stock / Math.max(1, a.min_stock)) - (b.current_stock / Math.max(1, b.min_stock)))
      setProducts(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Shortfall to minimum, valued at cost.
  const shortfallCost = products.reduce((s, p) => s + Math.max(0, p.min_stock - p.current_stock) * p.cost_price, 0)
  const out = products.filter(p => p.current_stock <= 0).length

  return (
    <div className="page">
      <PageHeader
        title="Reorder alerts"
        description="Products at or below their minimum stock level, most urgent first."
        actions={products.length > 0 ? <a href="/inventory/purchases" className="btn-primary">Create purchase order</a> : undefined}
      />

      <StatGrid cols={3}>
        <Stat label="Items to reorder" value={loading ? null : products.length} tone={products.length ? 'warning' : 'neutral'} hint={products.length ? 'At or below minimum' : 'Nothing to reorder'} />
        <Stat label="Out of stock" value={loading ? null : out} tone={out ? 'danger' : 'neutral'} hint={out ? 'Zero units on hand' : 'None'} />
        <Stat label="Cost to reach minimum" value={loading ? null : fmtINR(shortfallCost)} hint="Shortfall valued at cost price" />
      </StatGrid>

      <div className="table-wrap">
        {loading ? <LoadingRows rows={4} cols={5} /> : products.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Every product is above its minimum" description="Nothing needs reordering right now." />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hidden md:table-cell">Category</th>
                  <th className="num">In stock</th>
                  <th className="num">Minimum</th>
                  <th className="num">Shortfall</th>
                  <th className="num hidden sm:table-cell">Cost to minimum</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const deficit = Math.max(0, p.min_stock - p.current_stock)
                  const isEmpty = p.current_stock <= 0
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/inventory/products/${p.id}`, e)}>
                      <td className="font-medium text-gray-900">{p.name}</td>
                      <td className="hidden md:table-cell text-gray-600">{p.category || '—'}</td>
                      <td className="num whitespace-nowrap"><span className={isEmpty ? 'font-semibold text-red-700' : 'font-medium text-gray-900'}>{p.current_stock}</span> <span className="text-xs text-gray-500">{p.unit}</span></td>
                      <td className="num text-gray-600 whitespace-nowrap">{p.min_stock} <span className="text-xs text-gray-500">{p.unit}</span></td>
                      <td className="num whitespace-nowrap">{deficit > 0 ? <>{deficit} <span className="text-xs text-gray-500">{p.unit}</span></> : <span className="text-gray-500">At minimum</span>}</td>
                      <td className="num hidden sm:table-cell font-medium text-gray-900">{deficit > 0 ? fmtINR(deficit * p.cost_price) : '—'}</td>
                      <td><Badge tone={isEmpty ? 'danger' : 'warning'} dot>{isEmpty ? 'Out of stock' : 'Below minimum'}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
