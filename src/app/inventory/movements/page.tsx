'use client'
import { useEffect, useState } from 'react'
import { Plus, ArrowLeftRight } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, Badge, Modal, Field } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import { Select, DatePicker } from '@/components/controls'
import { toast } from '@/components/feedback'

interface Movement {
  id: string; product_id: string; product_name: string; movement_type: string
  quantity: number; reference_type: string; reference_id: string; notes: string; movement_date: string
}
interface Product { id: string; name: string; unit: string }

const emptyForm = () => ({ product_id: '', product_name: '', movement_type: 'IN', quantity: 1, reference_type: '', reference_id: '', notes: '', movement_date: new Date().toISOString().slice(0, 10) })

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [filterType, setFilterType] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    Promise.all([
      fetch('/api/inventory/movements').then(r => r.json()),
      fetch('/api/inventory/products').then(r => r.json()),
    ]).then(([m, p]) => { setMovements(Array.isArray(m) ? m : []); setProducts(Array.isArray(p) ? p : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const prod = products.find(p => p.id === form.product_id)
    // The movements API records the movement and adjusts the product's stock.
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, product_name: prod?.name ?? form.product_name }),
    })
    setSaving(false)
    if (!res.ok) { toast('Could not record the movement', { tone: 'error' }); return }
    toast('Movement recorded', { description: `${form.movement_type === 'IN' ? 'Received' : 'Issued'} ${form.quantity} ${prod?.unit ?? ''} of ${prod?.name ?? 'product'}`.replace(/\s+/g, ' ') })
    setShowForm(false); setForm(emptyForm()); load()
  }

  const filtered = movements.filter(m => {
    if (filterType && m.movement_type !== filterType) return false
    if (filterProduct && m.product_id !== filterProduct) return false
    return true
  })
  const unitOf = (id: string) => products.find(p => p.id === id)?.unit ?? ''

  return (
    <div className="page">
      <PageHeader
        title="Stock movements"
        description="Every unit received into or issued from stock."
        actions={<button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Record movement</button>}
      />

      <div className="table-wrap">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
          <Select size="sm" className="w-60" value={filterProduct} onChange={setFilterProduct} ariaLabel="Product"
            options={[{ value: '', label: 'All products' }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
          <div className="segmented" role="radiogroup" aria-label="Direction">
            {[['', 'All'], ['IN', 'Received'], ['OUT', 'Issued']].map(([v, l]) => (
              <button key={v} data-active={filterType === v} onClick={() => setFilterType(v)}>{l}</button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-500">{filtered.length} of {movements.length}</span>
        </div>
        {loading ? <LoadingRows rows={6} cols={5} /> : filtered.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title={movements.length ? 'No movements match these filters' : 'No movements recorded'}
            description={movements.length ? 'Try another product or direction.' : 'Record stock you receive or issue to a site. Received purchase orders are added automatically.'}
            action={movements.length ? undefined : <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={15} /> Record movement</button>} />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Date</th><th>Product</th><th>Direction</th><th className="num">Quantity</th><th className="hidden md:table-cell">Reference</th><th className="hidden lg:table-cell">Notes</th></tr></thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(String(m.movement_date).slice(0, 10))}</td>
                    <td>{m.product_id ? <a href={`/inventory/products/${m.product_id}`} className="font-medium text-gray-900 hover:underline">{m.product_name ?? '—'}</a> : <span className="font-medium text-gray-900">{m.product_name ?? '—'}</span>}</td>
                    <td><Badge tone={m.movement_type === 'IN' ? 'success' : 'danger'}>{m.movement_type === 'IN' ? 'Received' : 'Issued'}</Badge></td>
                    <td className="num font-medium text-gray-900 whitespace-nowrap">{m.movement_type === 'OUT' ? '−' : '+'}{m.quantity} <span className="text-xs font-normal text-gray-500">{unitOf(m.product_id)}</span></td>
                    <td className="hidden md:table-cell text-gray-600">{m.reference_type ? `${m.reference_type}${m.reference_id ? ` #${m.reference_id}` : ''}` : '—'}</td>
                    <td className="hidden lg:table-cell text-gray-500">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="Record movement" onClose={() => { setShowForm(false); setForm(emptyForm()) }} width="max-w-md"
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm()) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="mv-form" className="btn-primary" disabled={saving || !form.product_id || !form.quantity}>{saving ? 'Saving…' : 'Record'}</button>
          </>}>
          <form id="mv-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Product" required>
              <Select value={form.product_id} onChange={v => setForm(f => ({ ...f, product_id: v }))} ariaLabel="Product" placeholder="Select product"
                searchable options={products.map(p => ({ value: p.id, label: p.name }))} />
            </Field>
            <div className="segmented w-full" role="radiogroup" aria-label="Direction">
              {[['IN', 'Received into stock'], ['OUT', 'Issued from stock']].map(([v, l]) => (
                <button key={v} type="button" className="flex-1" data-active={form.movement_type === v} onClick={() => setForm(f => ({ ...f, movement_type: v }))}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity" required>
                <input type="number" required min="0" step="any" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="input tabular-nums" />
              </Field>
              <Field label="Date" required>
                <DatePicker required clearable={false} value={form.movement_date} onChange={v => setForm(f => ({ ...f, movement_date: v }))} ariaLabel="Movement date" />
              </Field>
            </div>
            <Field label="Reference" hint="Purchase order, project or reason.">
              <input value={form.reference_type} onChange={e => setForm(f => ({ ...f, reference_type: e.target.value }))} className="input" />
            </Field>
            <Field label="Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
