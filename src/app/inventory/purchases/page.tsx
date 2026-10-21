'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { PageHeader, Modal, Field, Stat, StatGrid } from '@/components/ui'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'
import { useNewParam } from '@/lib/useNewParam'
import { fmtINR } from '@/lib/format'
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
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const f = useFilters({ status: '', supplier: '', from: '', to: '' })
  const v = f.values
  useNewParam(() => setShowForm(true))

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory/purchases').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      fetch('/api/inventory/suppliers').then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/inventory/products').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([p, s, pr]) => {
      setPurchases(Array.isArray(p) ? p : []); setSuppliers(Array.isArray(s) ? s : []); setProducts(Array.isArray(pr) ? pr : [])
      setLoadError(''); setLoading(false)
    }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  function updateItem(idx: number, field: keyof PurchaseItem, value: string | number) {
    setForm(x => {
      const items = [...x.items]
      items[idx] = { ...items[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].total_price = Number(items[idx].quantity) * Number(items[idx].unit_price)
      }
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) { items[idx].description = prod.name; items[idx].unit = prod.unit; items[idx].unit_price = prod.cost_price; items[idx].total_price = Number(items[idx].quantity) * prod.cost_price }
      }
      return { ...x, items }
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
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast('Could not save the purchase order', { tone: 'error' }); return }
    toast(`Purchase order ${form.purchase_number} saved`)
    setShowForm(false); setForm(emptyForm()); load()
  }

  const rows = useMemo(() => purchases.map(p => ({ ...p, lines: (p.items ?? []).length })).filter(p =>
    (!v.status || p.status === v.status) && (!v.supplier || p.supplier_name === v.supplier) && inPeriod(p.purchase_date, { from: v.from, to: v.to })),
  [purchases, v])
  const thirty = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const recent = rows.filter(p => (p.purchase_date ?? '') >= thirty)
  const pending = rows.filter(p => p.status === 'pending')
  const formTotal = form.items.reduce((s, i) => s + Number(i.total_price), 0)

  const cols: Col[] = [
    { key: 'purchase_number', label: 'Order', kind: 'mono' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'purchase_date', label: 'Date', kind: 'date', hideBelow: 'sm' },
    { key: 'lines', label: 'Lines', kind: 'int', hideBelow: 'md' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'total_amount', label: 'Total', kind: 'money', total: true },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Purchases"
        description="Purchase orders placed with suppliers."
        actions={<button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New purchase</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Spend, last 30 days" value={loading ? null : fmtINR(recent.reduce((s, p) => s + Number(p.total_amount || 0), 0))} hint={loading ? undefined : `${recent.length} orders`} />
        <Stat label="Awaiting delivery" value={loading ? null : pending.length} hint={loading ? undefined : fmtINR(pending.reduce((s, p) => s + Number(p.total_amount || 0), 0))} tone={pending.length ? 'warning' : 'neutral'} />
        <Stat label="Spend, filtered orders" value={loading ? null : fmtINR(rows.reduce((s, p) => s + Number(p.total_amount || 0), 0))} hint={loading ? undefined : `${rows.length} orders`} />
      </StatGrid>

      <DataTable
        title="Purchase orders"
        exportTitle="Purchase orders"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        initialSort={{ key: 'purchase_date', dir: -1 }}
        searchPlaceholder="Search order or supplier"
        expand={r => {
          const p = r as unknown as Purchase
          return (p.items ?? []).length === 0 ? <p className="text-[12px] text-faint">No line items on this order.</p> : (
            <div>
              <table className="w-full text-[12px]">
                <thead><tr className="text-faint"><th className="pb-1.5 text-left font-medium">Item</th><th className="pb-1.5 text-right font-medium">Quantity</th><th className="pb-1.5 text-right font-medium">Unit price</th><th className="pb-1.5 text-right font-medium">Amount</th></tr></thead>
                <tbody>
                  {p.items.map((item, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5 text-ink">{item.description || '—'}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{item.quantity} {item.unit}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{fmtINR(item.unit_price)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-ink">{fmtINR(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.notes && <p className="mt-2 text-[12px] text-faint">{p.notes}</p>}
            </div>
          )
        }}
        filters={<>
          <FilterSelect value={v.status} onChange={x => f.set({ status: x })} all="All statuses" className="w-full sm:w-40"
            options={[{ value: 'received', label: 'Received' }, { value: 'pending', label: 'Pending' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <FilterSelect value={v.supplier} onChange={x => f.set({ supplier: x })} all="All suppliers" className="w-full sm:w-52" options={optionsFrom(purchases, p => p.supplier_name)} />
          <DateRange label="Ordered" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        empty={{ icon: ShoppingCart, title: 'No purchases yet', description: 'Record orders placed with suppliers. Received orders add their quantities to stock.',
          action: <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={14} /> New purchase</button> }}
      />

      {showForm && (
        <Modal title="New purchase order" onClose={() => { setShowForm(false); setForm(emptyForm()) }} width="max-w-3xl"
          footer={<>
            <span className="mr-auto text-[13px] text-muted">Total <span className="ml-1 font-semibold text-ink tabular-nums">{fmtINR(formTotal)}</span></span>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm()) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="purchase-form" className="btn-primary" disabled={saving || !form.purchase_number}>{saving ? 'Saving…' : 'Save purchase'}</button>
          </>}>
          <form id="purchase-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="Order number" required>
                <input required value={form.purchase_number} onChange={e => setForm(x => ({ ...x, purchase_number: e.target.value }))} className="input mono" placeholder="PO-2043" autoFocus />
              </Field>
              <Field label="Date" required>
                <DatePicker required clearable={false} value={form.purchase_date} onChange={val => setForm(x => ({ ...x, purchase_date: val }))} ariaLabel="Order date" />
              </Field>
              <Field label="Supplier">
                <Select value={form.supplier_id} onChange={val => setForm(x => ({ ...x, supplier_id: val }))} ariaLabel="Supplier" placeholder="Select supplier"
                  clearable options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={val => setForm(x => ({ ...x, status: val }))} ariaLabel="Status" options={[
                  { value: 'received', label: 'Received', description: 'Adds the quantities to stock' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]} minPanelWidth={240} />
              </Field>
            </div>

            <div className="rounded-md border border-gray-200">
              <div className="flex items-center justify-between px-3 h-10 border-b border-gray-200 bg-gray-50 rounded-t-md">
                <span className="text-xs font-medium text-gray-700">Order lines</span>
                <button type="button" onClick={() => setForm(x => ({ ...x, items: [...x.items, emptyItem()] }))} className="btn-ghost btn-xs"><Plus size={13} /> Add line</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[620px]">
                  <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium px-3 pt-2">Product</th><th className="text-left font-medium px-2 pt-2">Description</th><th className="text-right font-medium px-2 pt-2 w-20">Qty</th><th className="text-right font-medium px-2 pt-2 w-28">Unit price</th><th className="text-right font-medium px-2 pt-2 w-28">Amount</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {form.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5">
                          <Select size="sm" value={item.product_id} onChange={val => updateItem(idx, 'product_id', val)} ariaLabel="Product" placeholder="Select product"
                            minPanelWidth={260} options={products.map(p => ({ value: p.id, label: p.name }))} />
                        </td>
                        <td className="px-2 py-1.5"><input placeholder="Description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input h-8 text-xs" aria-label="Description" /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} className="input h-8 text-xs text-right tabular-nums" aria-label="Quantity" /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} className="input h-8 text-xs text-right tabular-nums" aria-label="Unit price" /></td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-gray-900">{fmtINR(item.total_price)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" onClick={() => setForm(x => ({ ...x, items: x.items.filter((_, i) => i !== idx) }))} disabled={form.items.length === 1}
                            className="btn-ghost btn-icon h-7 w-7 text-gray-400 hover:text-red-700" aria-label="Remove line"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Field label="Notes">
              <textarea value={form.notes} onChange={e => setForm(x => ({ ...x, notes: e.target.value }))} rows={2} className="input resize-none" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
