'use client'
import { Fragment, useEffect, useState } from 'react'
import { Plus, Trash2, ChevronRight, ShoppingCart } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, SearchInput, StatusBadge, Modal, Field, Stat, StatGrid } from '@/components/ui'
import { fmtINR, fmtDate } from '@/lib/format'
import { Select, DatePicker } from '@/components/controls'
import { toast } from '@/components/feedback'

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; unit: string; cost_price: number }
interface PurchaseItem { id?: string; product_id: string; description: string; category: string; quantity: number; unit: string; unit_price: number; total_price: number }
interface Purchase {
  id: string; purchase_number: string; supplier_id: string; supplier_name: string
  purchase_date: string; total_amount: number; status: string; notes: string
  items: PurchaseItem[]
}

const emptyItem = (): PurchaseItem => ({ product_id: '', description: '', category: '', quantity: 1, unit: 'nos', unit_price: 0, total_price: 0 })
const emptyForm = () => ({ purchase_number: '', supplier_id: '', supplier_name: '', purchase_date: new Date().toISOString().slice(0, 10), status: 'received', notes: '', items: [emptyItem()] })

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    Promise.all([
      fetch('/api/inventory/purchases').then(r => r.json()),
      fetch('/api/inventory/suppliers').then(r => r.json()),
      fetch('/api/inventory/products').then(r => r.json()),
    ]).then(([p, s, pr]) => {
      setPurchases(Array.isArray(p) ? p : []); setSuppliers(Array.isArray(s) ? s : []); setProducts(Array.isArray(pr) ? pr : []); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  function updateItem(idx: number, field: keyof PurchaseItem, value: string | number) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].total_price = Number(items[idx].quantity) * Number(items[idx].unit_price)
      }
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) { items[idx].description = prod.name; items[idx].unit = prod.unit; items[idx].unit_price = prod.cost_price; items[idx].total_price = Number(items[idx].quantity) * prod.cost_price }
      }
      return { ...f, items }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const sup = suppliers.find(s => s.id === form.supplier_id)
    const res = await fetch('/api/inventory/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, supplier_name: sup?.name ?? form.supplier_name }),
    })
    setSaving(false)
    if (!res.ok) { toast('Could not save the purchase order', { tone: 'error' }); return }
    toast(`Purchase order ${form.purchase_number} saved`)
    setShowForm(false); setForm(emptyForm()); load()
  }

  const q = search.toLowerCase()
  const filtered = purchases.filter(p => !q || (p.purchase_number ?? '').toLowerCase().includes(q) || (p.supplier_name ?? '').toLowerCase().includes(q))
  const thirty = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const recent = purchases.filter(p => (p.purchase_date ?? '') >= thirty)
  const pending = purchases.filter(p => p.status === 'pending')
  const formTotal = form.items.reduce((s, i) => s + Number(i.total_price), 0)

  return (
    <div className="page">
      <PageHeader
        title="Purchases"
        description="Purchase orders placed with suppliers."
        actions={<button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New purchase</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Spend, last 30 days" value={loading ? null : fmtINR(recent.reduce((s, p) => s + Number(p.total_amount || 0), 0))} hint={`${recent.length} orders`} />
        <Stat label="Awaiting delivery" value={loading ? null : pending.length} hint={fmtINR(pending.reduce((s, p) => s + Number(p.total_amount || 0), 0))} tone={pending.length ? 'warning' : 'neutral'} />
        <Stat label="All-time spend" value={loading ? null : fmtINR(purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0))} hint={`${purchases.length} orders`} />
      </StatGrid>

      <div className="table-wrap">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
          <span className="text-xs text-gray-500 pl-1">Select an order to see its lines</span>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order or supplier" />
        </div>
        {loading ? <LoadingRows rows={4} cols={5} /> : filtered.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={purchases.length ? 'No orders match' : 'No purchases yet'}
            action={!purchases.length ? <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> New purchase</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th className="w-8" /><th>Order</th><th>Supplier</th><th className="hidden sm:table-cell">Date</th><th className="hidden md:table-cell num">Lines</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>
                {filtered.map(p => {
                  const open = expanded === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr className="cursor-pointer" onClick={() => setExpanded(open ? null : p.id)} aria-expanded={open}>
                        <td className="pr-0"><ChevronRight size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} /></td>
                        <td className="mono text-xs font-medium text-gray-900">{p.purchase_number || '—'}</td>
                        <td>{p.supplier_name || '—'}</td>
                        <td className="hidden sm:table-cell whitespace-nowrap tabular-nums">{fmtDate(p.purchase_date)}</td>
                        <td className="hidden md:table-cell num">{(p.items ?? []).length}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="num font-medium text-gray-900">{fmtINR(p.total_amount)}</td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/70 hover:bg-gray-50/70">
                          <td />
                          <td colSpan={6} className="py-3">
                            {(p.items ?? []).length === 0 ? <p className="text-xs text-gray-500">No line items on this order.</p> : (
                              <table className="w-full text-xs">
                                <thead><tr className="text-gray-500"><th className="text-left font-medium pb-1.5">Item</th><th className="text-right font-medium pb-1.5">Quantity</th><th className="text-right font-medium pb-1.5">Unit price</th><th className="text-right font-medium pb-1.5">Amount</th></tr></thead>
                                <tbody>
                                  {p.items.map((item, i) => (
                                    <tr key={i} className="border-t border-gray-200/70">
                                      <td className="py-1.5 text-gray-800">{item.description || '—'}</td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">{item.quantity} {item.unit}</td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">{fmtINR(item.unit_price)}</td>
                                      <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">{fmtINR(item.total_price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {p.notes && <p className="mt-2 text-xs text-gray-500">{p.notes}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="New purchase order" onClose={() => { setShowForm(false); setForm(emptyForm()) }} width="max-w-3xl"
          footer={<>
            <span className="mr-auto text-[13px] text-gray-600">Total <span className="ml-1 font-semibold text-gray-900 tabular-nums">{fmtINR(formTotal)}</span></span>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm()) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="purchase-form" className="btn-primary" disabled={saving || !form.purchase_number}>{saving ? 'Saving…' : 'Save purchase'}</button>
          </>}>
          <form id="purchase-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="Order number" required>
                <input required value={form.purchase_number} onChange={e => setForm(f => ({ ...f, purchase_number: e.target.value }))} className="input mono" placeholder="PO-2043" autoFocus />
              </Field>
              <Field label="Date" required>
                <DatePicker required clearable={false} value={form.purchase_date} onChange={v => setForm(f => ({ ...f, purchase_date: v }))} ariaLabel="Order date" />
              </Field>
              <Field label="Supplier">
                <Select value={form.supplier_id} onChange={v => setForm(f => ({ ...f, supplier_id: v }))} ariaLabel="Supplier" placeholder="Select supplier"
                  clearable options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} ariaLabel="Status" options={[
                  { value: 'received', label: 'Received', description: 'Adds the quantities to stock' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]} minPanelWidth={240} />
              </Field>
            </div>

            <div className="rounded-md border border-gray-200">
              <div className="flex items-center justify-between px-3 h-10 border-b border-gray-200 bg-gray-50 rounded-t-md">
                <span className="text-xs font-medium text-gray-700">Order lines</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="btn-ghost btn-xs"><Plus size={13} /> Add line</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[620px]">
                  <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium px-3 pt-2">Product</th><th className="text-left font-medium px-2 pt-2">Description</th><th className="text-right font-medium px-2 pt-2 w-20">Qty</th><th className="text-right font-medium px-2 pt-2 w-28">Unit price</th><th className="text-right font-medium px-2 pt-2 w-28">Amount</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {form.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5">
                          <Select size="sm" value={item.product_id} onChange={v => updateItem(idx, 'product_id', v)} ariaLabel="Product" placeholder="Select product"
                            minPanelWidth={260} options={products.map(p => ({ value: p.id, label: p.name }))} />
                        </td>
                        <td className="px-2 py-1.5"><input placeholder="Description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input h-8 text-xs" aria-label="Description" /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} className="input h-8 text-xs text-right tabular-nums" aria-label="Quantity" /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} className="input h-8 text-xs text-right tabular-nums" aria-label="Unit price" /></td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-gray-900">{fmtINR(item.total_price)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} disabled={form.items.length === 1}
                            className="btn-ghost btn-icon h-7 w-7 text-gray-400 hover:text-red-700" aria-label="Remove line"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Field label="Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
