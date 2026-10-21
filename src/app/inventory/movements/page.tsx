'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ArrowLeftRight } from 'lucide-react'
import { PageHeader, Badge, Modal, Field, Stat, StatGrid } from '@/components/ui'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'
import { Select, DatePicker } from '@/components/controls'
import { toast } from '@/components/feedback'

interface Movement {
  id: string; product_id: string; product_name: string; movement_type: string
  quantity: number; reference_type: string; reference_id: string; notes: string; movement_date: string
}
interface Product { id: string; name: string; unit: string; category?: string }

const emptyForm = () => ({ product_id: '', product_name: '', movement_type: 'IN', quantity: 1, reference_type: '', reference_id: '', notes: '', movement_date: new Date().toISOString().slice(0, 10) })

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const f = useFilters({ type: '', product: '', category: '', reference: '', from: '', to: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory/movements').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      fetch('/api/inventory/products').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([m, p]) => { setMovements(Array.isArray(m) ? m : []); setProducts(Array.isArray(p) ? p : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const prod = products.find(p => p.id === form.product_id)
    // The movements API records the movement and adjusts the product's stock.
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, product_name: prod?.name ?? form.product_name }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast('Could not record the movement', { tone: 'error' }); return }
    toast('Movement recorded', { description: `${form.movement_type === 'IN' ? 'Received' : 'Issued'} ${form.quantity} ${prod?.unit ?? ''} of ${prod?.name ?? 'product'}`.replace(/\s+/g, ' ') })
    setShowForm(false); setForm(emptyForm()); load()
  }

  const byId = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const rows = useMemo(() => movements.map(m => ({
    ...m,
    date: String(m.movement_date ?? '').slice(0, 10),
    unit: byId[m.product_id]?.unit ?? '',
    category: byId[m.product_id]?.category ?? '',
    signed: (m.movement_type === 'OUT' ? -1 : 1) * Number(m.quantity || 0),
    reference: m.reference_type ? `${m.reference_type}${m.reference_id ? ` #${m.reference_id}` : ''}` : '',
  })).filter(m =>
    (!v.type || m.movement_type === v.type) && (!v.product || m.product_id === v.product) && (!v.category || m.category === v.category) &&
    (!v.reference || m.reference_type === v.reference) && inPeriod(m.date, { from: v.from, to: v.to })), [movements, byId, v])

  const received = rows.filter(m => m.movement_type === 'IN').reduce((s, m) => s + Number(m.quantity || 0), 0)
  const issued = rows.filter(m => m.movement_type === 'OUT').reduce((s, m) => s + Number(m.quantity || 0), 0)
  const cols: Col[] = [
    { key: 'date', label: 'Date', kind: 'date' },
    { key: 'product_name', label: 'Product', sub: { key: 'category', label: 'Category' },
      render: r => r.product_id ? <a href={`/inventory/products/${r.product_id}`}>{String(r.product_name ?? '—')}</a> : <span className="font-medium">{String(r.product_name ?? '—')}</span> },
    { key: 'movement_type', label: 'Direction', value: r => (r.movement_type === 'IN' ? 'Received' : 'Issued'),
      render: r => <Badge tone={r.movement_type === 'IN' ? 'success' : 'danger'}>{r.movement_type === 'IN' ? 'Received' : 'Issued'}</Badge> },
    { key: 'signed', label: 'Quantity', kind: 'number', total: true,
      render: r => <span className="font-medium">{Number(r.signed) < 0 ? '−' : '+'}{Math.abs(Number(r.signed)).toLocaleString('en-IN')} <span className="text-[12px] font-normal text-faint">{String(r.unit)}</span></span> },
    { key: 'reference', label: 'Reference', hideBelow: 'md' },
    { key: 'notes', label: 'Notes', hideBelow: 'lg' },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Stock movements"
        description="Every unit received into or issued from stock."
        actions={<button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Record movement</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Movements" value={loading ? null : rows.length} hint={loading ? undefined : `${rows.filter(m => m.movement_type === 'IN').length} received · ${rows.filter(m => m.movement_type === 'OUT').length} issued`} />
        <Stat label="Units received" value={loading ? null : received.toLocaleString('en-IN')} hint={loading ? undefined : 'Across the filtered movements'} tone="success" />
        <Stat label="Units issued" value={loading ? null : issued.toLocaleString('en-IN')} hint={loading ? undefined : `Net ${(received - issued).toLocaleString('en-IN')}`} />
      </StatGrid>

      <DataTable
        title="Movements"
        exportTitle="Stock movements"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        initialSort={{ key: 'date', dir: -1 }}
        searchPlaceholder="Search product, reference, notes"
        filters={<>
          <div className="seg seg-sm" role="group" aria-label="Direction">
            {[['', 'All'], ['IN', 'Received'], ['OUT', 'Issued']].map(([val, l]) => (
              <button key={val} type="button" aria-pressed={v.type === val} data-active={v.type === val} onClick={() => f.set({ type: val })}>{l}</button>
            ))}
          </div>
          <FilterSelect value={v.product} onChange={x => f.set({ product: x })} all="All products" className="w-full sm:w-56" options={products.map(p => ({ value: p.id, label: p.name }))} />
          <FilterSelect value={v.category} onChange={x => f.set({ category: x })} all="All categories" options={optionsFrom(products, p => p.category)} />
          <FilterSelect value={v.reference} onChange={x => f.set({ reference: x })} all="Any reference" options={optionsFrom(movements, m => m.reference_type)} />
          <DateRange label="Moved" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        empty={{ icon: ArrowLeftRight, title: 'No movements recorded', description: 'Record stock you receive or issue to a site. Received purchase orders are added automatically.',
          action: <button onClick={() => setShowForm(true)} className="btn-primary btn-sm"><Plus size={14} /> Record movement</button> }}
      />

      {showForm && (
        <Modal title="Record movement" onClose={() => { setShowForm(false); setForm(emptyForm()) }} width="max-w-md"
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm()) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="mv-form" className="btn-primary" disabled={saving || !form.product_id || !form.quantity}>{saving ? 'Saving…' : 'Record'}</button>
          </>}>
          <form id="mv-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Product" required>
              <Select value={form.product_id} onChange={val => setForm(x => ({ ...x, product_id: val }))} ariaLabel="Product" placeholder="Select product"
                searchable options={products.map(p => ({ value: p.id, label: p.name }))} />
            </Field>
            <div className="seg !w-full" role="group" aria-label="Direction">
              {[['IN', 'Received into stock'], ['OUT', 'Issued from stock']].map(([val, l]) => (
                <button key={val} type="button" className="flex-1" aria-pressed={form.movement_type === val} data-active={form.movement_type === val} onClick={() => setForm(x => ({ ...x, movement_type: val }))}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity" required>
                <input type="number" required min="0" step="any" value={form.quantity} onChange={e => setForm(x => ({ ...x, quantity: Number(e.target.value) }))} className="input tabular-nums" />
              </Field>
              <Field label="Date" required>
                <DatePicker required clearable={false} value={form.movement_date} onChange={val => setForm(x => ({ ...x, movement_date: val }))} ariaLabel="Movement date" />
              </Field>
            </div>
            <Field label="Reference" hint="Purchase order, project or reason.">
              <input value={form.reference_type} onChange={e => setForm(x => ({ ...x, reference_type: e.target.value }))} className="input" />
            </Field>
            <Field label="Notes">
              <textarea value={form.notes} onChange={e => setForm(x => ({ ...x, notes: e.target.value }))} rows={2} className="input resize-none" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
