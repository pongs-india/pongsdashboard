'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2, Plus, Package } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, SearchInput, Badge, Modal, Field } from '@/components/ui'
import { PRODUCT_CATEGORIES, stockState, STOCK_LABEL, STOCK_TONE } from '@/lib/inventory'
import { fmtINR } from '@/lib/format'
import { useNewParam } from '@/lib/useNewParam'
import { Select } from '@/components/controls'
import { confirmDialog, toast } from '@/components/feedback'
import { navigate } from '@/lib/navigate'

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
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'attention'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/inventory/products').then(r => r.json()).then(d => { setProducts(Array.isArray(d) ? d : []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (editId) {
      await fetch(`/api/inventory/products/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    } else {
      await fetch('/api/inventory/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
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

  // Categories present in the data plus the standard list, so imported
  // categories remain filterable.
  const categories = Array.from(new Set([...PRODUCT_CATEGORIES, ...products.map(p => p.category).filter(Boolean)]))
    .filter(c => products.some(p => p.category === c))
  const attentionCount = products.filter(p => ['out', 'low'].includes(stockState(Number(p.current_stock), Number(p.min_stock)))).length

  const filtered = products.filter(p => {
    if (catFilter && p.category !== catFilter) return false
    if (stockFilter === 'attention' && !['out', 'low'].includes(stockState(Number(p.current_stock), Number(p.min_stock)))) return false
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
  })
  const value = filtered.reduce((s, p) => s + Number(p.current_stock) * Number(p.cost_price), 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Products"
        description="Every stocked item with its levels and prices."
        actions={<button className="btn-primary" onClick={() => { setEditId(null); setForm(empty()); setShowForm(true) }}><Plus size={15} strokeWidth={2.25} /> Add product</button>}
      />

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select size="sm" className="w-52" value={catFilter} onChange={setCatFilter} ariaLabel="Category"
              options={[{ value: '', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]} />
            <div className="segmented">
              <button data-active={stockFilter === 'all'} onClick={() => setStockFilter('all')}>All stock</button>
              <button data-active={stockFilter === 'attention'} onClick={() => setStockFilter('attention')}>Needs attention <span className="tabular-nums text-gray-400">{attentionCount}</span></button>
            </div>
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SKU" />
        </div>

        {loading ? <LoadingRows rows={6} cols={6} /> : filtered.length === 0 ? (
          <EmptyState icon={Package} title={products.length ? 'No products match these filters' : 'No products yet'}
            description={products.length ? 'Try another category or search term.' : 'Add the items you stock to start tracking levels.'}
            action={!products.length ? <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add product</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hidden md:table-cell">Category</th>
                  <th className="num">In stock</th>
                  <th className="hidden sm:table-cell">Status</th>
                  <th className="num hidden lg:table-cell">Cost</th>
                  <th className="num hidden lg:table-cell">Sell</th>
                  <th className="num hidden xl:table-cell">Stock value</th>
                  <th className="w-20"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const st = stockState(Number(p.current_stock), Number(p.min_stock))
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={e => {
                      if ((e.target as HTMLElement).closest('button,a')) return
                      navigate(`/inventory/products/${p.id}`)
                    }}>
                      <td className="max-w-[280px]">
                        <a href={`/inventory/products/${p.id}`} className="block truncate font-medium text-gray-900 hover:underline">{p.name}</a>
                        {p.sku && <div className="mono text-2xs text-gray-500">{p.sku}</div>}
                      </td>
                      <td className="hidden md:table-cell text-gray-600">{p.category || '—'}</td>
                      <td className="num whitespace-nowrap">
                        <span className="font-medium text-gray-900">{Number(p.current_stock).toLocaleString('en-IN')}</span>
                        <span className="ml-1 text-xs text-gray-500">{p.unit}</span>
                        {Number(p.min_stock) > 0 && <div className="text-2xs text-gray-500">min {p.min_stock}</div>}
                      </td>
                      <td className="hidden sm:table-cell"><Badge tone={STOCK_TONE[st]} dot>{STOCK_LABEL[st]}</Badge></td>
                      <td className="num hidden lg:table-cell">{fmtINR(p.cost_price)}</td>
                      <td className="num hidden lg:table-cell">{fmtINR(p.sell_price)}</td>
                      <td className="num hidden xl:table-cell font-medium text-gray-900">{fmtINR(Number(p.current_stock) * Number(p.cost_price))}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn-ghost btn-icon" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
                        <button className="btn-ghost btn-icon text-gray-400 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(p)} aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="table-footer"><span>{filtered.length} of {products.length} products</span><span className="tabular-nums">Stock value {fmtINR(value)}</span></div>
        )}
      </div>

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
            <Field label="Minimum stock" hint="Below this the item appears on the reorder list."><input className="input tabular-nums" type="number" value={form.min_stock} onChange={f('min_stock')} /></Field>
            <Field label="Current stock" hint={editId ? 'Prefer recording a movement so the change is logged.' : undefined}><input className="input tabular-nums" type="number" value={form.current_stock} onChange={f('current_stock')} /></Field>
            <div className="hidden sm:block" />
            <Field label="Cost price (₹)"><input className="input tabular-nums" type="number" value={form.cost_price} onChange={f('cost_price')} /></Field>
            <Field label="Sell price (₹)"><input className="input tabular-nums" type="number" value={form.sell_price} onChange={f('sell_price')} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className="input resize-none" rows={2} value={form.notes} onChange={f('notes')} /></Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
