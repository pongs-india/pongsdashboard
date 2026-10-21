'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Package } from 'lucide-react'
import { PageHeader, Badge, Modal, Field, Stat, StatGrid } from '@/components/ui'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect } from '@/components/filters'
import { PRODUCT_CATEGORIES, stockState, STOCK_LABEL, STOCK_TONE } from '@/lib/inventory'
import { fmtINR } from '@/lib/format'
import { useNewParam } from '@/lib/useNewParam'
import { Select } from '@/components/controls'
import { confirmDialog, toast } from '@/components/feedback'

interface Product {
  id: string; name: string; category: string; sku: string; unit: string
  current_stock: number; min_stock: number; cost_price: number; sell_price: number; notes: string
}

const empty = (): Omit<Product, 'id'> => ({ name: '', category: '', sku: '', unit: 'nos', current_stock: 0, min_stock: 0, cost_price: 0, sell_price: 0, notes: '' })

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [showForm, setShowForm] = useState(false)
  useNewParam(() => setShowForm(true))
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState<string | null>(null)
  const flt = useFilters({ category: '', stock: '', margin: '' })
  const fv = flt.values
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/inventory/products')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setProducts(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(editId ? `/api/inventory/products/${editId}` : '/api/inventory/products', {
      method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).catch(() => null)
    setSaving(false)
    // Keep the form open with the user's input if the save failed.
    if (!res?.ok) { toast('Could not save the product. Check the details and try again.', { tone: 'error' }); return }
    toast(editId ? 'Product updated' : 'Product added')
    setShowForm(false); setEditId(null); setForm(empty()); load()
  }

  async function handleDelete(p: Product) {
    const ok = await confirmDialog({ title: 'Delete product', body: `"${p.name}" will be removed from the catalogue. Its movement history stays in the log.`, confirmLabel: 'Delete product', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/inventory/products/${p.id}`, { method: 'DELETE' })
    if (res.ok) toast('Product deleted'); else toast('Could not delete the product', { tone: 'error' })
    load()
  }

  function startEdit(p: Product) {
    setEditId(p.id); setForm({ name: p.name, category: p.category ?? '', sku: p.sku ?? '', unit: p.unit ?? 'nos', current_stock: p.current_stock, min_stock: p.min_stock, cost_price: p.cost_price, sell_price: p.sell_price, notes: p.notes ?? '' })
    setShowForm(true)
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  // Categories present in the data plus the standard list, so imported categories remain filterable.
  const categories = Array.from(new Set([...PRODUCT_CATEGORIES, ...products.map(p => p.category).filter(Boolean)]))
    .filter(c => products.some(p => p.category === c))

  const rows = useMemo(() => products.map(p => {
    const st = stockState(Number(p.current_stock), Number(p.min_stock))
    const cost = Number(p.cost_price || 0), sell = Number(p.sell_price || 0)
    return { ...p, state: st, value: Number(p.current_stock) * cost, margin: sell > 0 ? ((sell - cost) / sell) * 100 : null }
  }).filter(p =>
    (!fv.category || p.category === fv.category) &&
    (!fv.stock || (fv.stock === 'attention' ? ['out', 'low'].includes(p.state) : p.state === fv.stock)) &&
    (!fv.margin || (fv.margin === 'none' ? p.margin === null : fv.margin === 'low' ? p.margin !== null && p.margin < 20 : p.margin !== null && p.margin >= 20))),
  [products, fv])
  const STOCK_RANK: Record<string, number> = { out: 0, low: 1, ok: 2 }
  const value = rows.reduce((s, p) => s + p.value, 0)
  const attention = rows.filter(p => ['out', 'low'].includes(p.state)).length

  const cols: Col[] = [
    { key: 'name', label: 'Product', sub: { key: 'sku', label: 'SKU', mono: true }, render: r => <a href={`/inventory/products/${r.id}`}>{String(r.name)}</a> },
    { key: 'category', label: 'Category', hideBelow: 'md' },
    { key: 'current_stock', label: 'In stock', kind: 'number', render: r => (
      <span className="whitespace-nowrap"><span className="font-medium">{Number(r.current_stock).toLocaleString('en-IN')}</span> <span className="text-[12px] text-faint">{String(r.unit ?? '')}</span>
        {Number(r.min_stock) > 0 && <span className="block text-[11px] text-faint">min {String(r.min_stock)}</span>}</span>
    ) },
    { key: 'state', label: 'Status', hideBelow: 'sm', value: r => STOCK_LABEL[r.state as keyof typeof STOCK_LABEL], sortValue: r => STOCK_RANK[String(r.state)] ?? 3,
      render: r => <Badge tone={STOCK_TONE[r.state as keyof typeof STOCK_TONE]} dot>{STOCK_LABEL[r.state as keyof typeof STOCK_LABEL]}</Badge> },
    { key: 'cost_price', label: 'Cost', kind: 'money', hideBelow: 'lg' },
    { key: 'sell_price', label: 'Sell', kind: 'money', hideBelow: 'lg' },
    { key: 'margin', label: 'Margin', kind: 'percent', hideBelow: 'xl' },
    { key: 'value', label: 'Stock value', kind: 'money', total: true, hideBelow: 'sm' },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Products"
        description="Every stocked item with its levels, prices and margin."
        actions={<button className="btn-primary" onClick={() => { setEditId(null); setForm(empty()); setShowForm(true) }}><Plus size={15} strokeWidth={2.25} /> Add product</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Products" value={loading ? null : rows.length} hint={loading ? undefined : `${categories.length} categories`} />
        <Stat label="Stock value" value={loading ? null : fmtINR(value)} hint={loading ? undefined : 'On hand, at cost'} />
        <Stat label="Need attention" value={loading ? null : attention} tone={attention ? 'warning' : 'neutral'} hint={loading ? undefined : attention ? 'Out of stock or below minimum' : 'All above minimum'} href="/inventory/reorder" />
      </StatGrid>

      <DataTable
        title="Catalogue"
        exportTitle="Products"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/inventory/products/${r.id}`}
        initialSort={{ key: 'name', dir: 1 }}
        searchPlaceholder="Search name or SKU"
        rowActions={r => [
          { icon: 'open', label: `Open ${r.name}`, href: `/inventory/products/${r.id}` },
          { icon: 'edit', label: `Edit ${r.name}`, onClick: () => startEdit(r as unknown as Product) },
          { icon: 'trash', label: `Delete ${r.name}`, tone: 'danger', onClick: () => handleDelete(r as unknown as Product) },
        ]}
        filters={<>
          <FilterSelect value={fv.category} onChange={x => flt.set({ category: x })} all="All categories" className="w-full sm:w-52" options={categories.map(c => ({ value: c, label: c }))} />
          <FilterSelect value={fv.stock} onChange={x => flt.set({ stock: x })} all="Any stock level" className="w-full sm:w-48"
            options={[{ value: 'attention', label: 'Needs attention' }, { value: 'out', label: 'Out of stock' }, { value: 'low', label: 'Below minimum' }, { value: 'ok', label: 'In stock' }]} />
          <FilterSelect value={fv.margin} onChange={x => flt.set({ margin: x })} all="Any margin" className="w-full sm:w-44"
            options={[{ value: 'low', label: 'Under 20% margin' }, { value: 'healthy', label: '20% or more' }, { value: 'none', label: 'No sell price' }]} />
        </>}
        filtersActive={flt.active}
        onClearFilters={flt.clear}
        empty={{ icon: Package, title: 'No products yet', description: 'Add the items you stock to start tracking levels.',
          action: <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add product</button> }}
        summary={visible => `Stock value ${fmtINR(visible.reduce((t, p) => t + Number(p.value || 0), 0))}`}
      />

      {showForm && (
        <Modal title={editId ? 'Edit product' : 'Add product'} onClose={() => { setShowForm(false); setEditId(null) }} width="max-w-xl"
          footer={<>
            <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
            <button type="submit" form="product-form" className="btn-primary" disabled={saving || !form.name}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add product'}</button>
          </>}>
          <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" required className="sm:col-span-2"><input className="input" required value={form.name} onChange={f('name')} autoFocus /></Field>
            <Field label="Category">
              <Select value={form.category} onChange={v => setForm(p => ({ ...p, category: v }))} ariaLabel="Category"
                options={[{ value: '', label: 'Uncategorised' }, ...Array.from(new Set([...PRODUCT_CATEGORIES, form.category].filter(Boolean))).map(c => ({ value: c, label: c }))]} />
            </Field>
            <Field label="SKU"><input className="input mono" value={form.sku} onChange={f('sku')} /></Field>
            <Field label="Unit" hint="For example nos, sqm, mtr, rmt."><input className="input" value={form.unit} onChange={f('unit')} /></Field>
            <Field label="Minimum stock" hint="Below this the item appears on the reorder list."><input className="input tabular-nums" type="number" min={0} step="any" inputMode="decimal" value={form.min_stock} onChange={f('min_stock')} /></Field>
            <Field label="Current stock" hint={editId ? 'Prefer recording a movement so the change is logged.' : undefined}><input className="input tabular-nums" type="number" min={0} step="any" inputMode="decimal" value={form.current_stock} onChange={f('current_stock')} /></Field>
            <div className="hidden sm:block" />
            <Field label="Cost price (₹)"><input className="input tabular-nums" type="number" min={0} step="0.01" inputMode="decimal" value={form.cost_price} onChange={f('cost_price')} /></Field>
            <Field label="Sell price (₹)"><input className="input tabular-nums" type="number" min={0} step="0.01" inputMode="decimal" value={form.sell_price} onChange={f('sell_price')} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className="input resize-none" rows={2} value={form.notes} onChange={f('notes')} /></Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
