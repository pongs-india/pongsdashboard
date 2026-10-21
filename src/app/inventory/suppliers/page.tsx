'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { PageHeader, Modal, Field, Avatar, Stat, StatGrid } from '@/components/ui'
import { confirmDialog, toast } from '@/components/feedback'
import { fmtINR } from '@/lib/format'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, optionsFrom } from '@/components/filters'

interface Supplier {
  id: string; name: string; contact_name: string; email: string; phone: string; city: string; address: string; notes: string
}
type Purchase = { supplier_id: string | null; supplier_name: string | null; total_amount: number; purchase_date: string; status: string }
const empty = (): Omit<Supplier, 'id'> => ({ name: '', contact_name: '', email: '', phone: '', city: '', address: '', notes: '' })

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const f = useFilters({ city: '', ordered: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory/suppliers').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      fetch('/api/inventory/purchases').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([s, p]) => {
      setSuppliers(Array.isArray(s) ? s : [])
      setPurchases(Array.isArray(p) ? p : [])
      setLoadError('')
      setLoading(false)
    }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(editId ? `/api/inventory/suppliers/${editId}` : '/api/inventory/suppliers', {
      method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast('Could not save the supplier. Check the details and try again.', { tone: 'error' }); return }
    toast(editId ? 'Supplier updated' : 'Supplier added')
    setShowForm(false); setForm(empty()); setEditId(null); load()
  }
  async function handleDelete(s: Supplier) {
    const ok = await confirmDialog({ title: 'Delete supplier', body: `"${s.name}" will be removed. Existing purchase orders keep their supplier name, and an administrator can restore the supplier from the audit log for 30 days.`, confirmLabel: 'Delete supplier', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/inventory/suppliers/${s.id}`, { method: 'DELETE' })
    if (res.ok) toast('Supplier deleted'); else toast('Could not delete the supplier', { tone: 'error' })
    load()
  }
  function openEdit(s: Supplier) {
    setForm({ name: s.name, contact_name: s.contact_name ?? '', email: s.email ?? '', phone: s.phone ?? '', city: s.city ?? '', address: s.address ?? '', notes: s.notes ?? '' })
    setEditId(s.id); setShowForm(true)
  }
  const set = (k: keyof ReturnType<typeof empty>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(x => ({ ...x, [k]: e.target.value }))

  // Purchase orders per supplier: matched by id, or by name for older orders.
  const withSpend = useMemo(() => suppliers.map(s => {
    const mine = purchases.filter(p => p.supplier_id === s.id || (!p.supplier_id && p.supplier_name === s.name))
    const last = mine.map(p => p.purchase_date).filter(Boolean).sort().pop() ?? ''
    return { ...s, orders: mine.length, spend: mine.reduce((t, p) => t + Number(p.total_amount || 0), 0), last_order: last }
  }), [suppliers, purchases])
  const rows = useMemo(() => withSpend.filter(s =>
    (!v.city || s.city === v.city) && (!v.ordered || (v.ordered === 'yes' ? s.orders > 0 : s.orders === 0))), [withSpend, v])
  const top = [...rows].sort((a, b) => b.spend - a.spend)[0]

  const cols: Col[] = [
    { key: 'name', label: 'Supplier', sub: { key: 'address', label: 'Address' }, render: r => (
      <div className="flex items-center gap-3"><Avatar name={String(r.name)} size={28} /><span className="truncate font-medium">{String(r.name)}</span></div>
    ) },
    { key: 'contact_name', label: 'Contact', hideBelow: 'md' },
    { key: 'phone', label: 'Phone', hideBelow: 'lg', render: r => r.phone ? <a href={`tel:${r.phone}`} className="whitespace-nowrap">{String(r.phone)}</a> : <span className="text-faint">—</span> },
    { key: 'email', label: 'Email', hideBelow: 'xl', render: r => r.email ? <a href={`mailto:${r.email}`}>{String(r.email)}</a> : <span className="text-faint">—</span> },
    { key: 'city', label: 'City', hideBelow: 'sm' },
    { key: 'orders', label: 'Orders', kind: 'int', total: true, hideBelow: 'sm' },
    { key: 'last_order', label: 'Last order', kind: 'date', hideBelow: 'lg' },
    { key: 'spend', label: 'Spend', kind: 'money', total: true },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Suppliers"
        description="Vendors for fabric, lighting and hardware, with what you have bought from each."
        actions={<button onClick={() => { setShowForm(true); setForm(empty()); setEditId(null) }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add supplier</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Suppliers" value={loading ? null : rows.length} hint={loading ? undefined : `${rows.filter(s => s.orders > 0).length} with purchase orders`} />
        <Stat label="Total spend" value={loading ? null : fmtINR(rows.reduce((t, s) => t + s.spend, 0))} hint={loading ? undefined : `${rows.reduce((t, s) => t + s.orders, 0)} purchase orders`} href="/inventory/purchases" />
        <Stat label="Largest supplier" value={loading ? null : top && top.spend > 0 ? fmtINR(top.spend) : '—'} hint={loading ? undefined : top && top.spend > 0 ? top.name : 'No purchases yet'} />
      </StatGrid>

      <DataTable
        title="All suppliers"
        exportTitle="Suppliers"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        initialSort={{ key: 'name', dir: 1 }}
        searchPlaceholder="Search name, contact, city"
        rowActions={r => [
          { icon: 'edit', label: `Edit ${r.name}`, onClick: () => openEdit(r as unknown as Supplier) },
          { icon: 'trash', label: `Delete ${r.name}`, tone: 'danger', onClick: () => handleDelete(r as unknown as Supplier) },
        ]}
        filters={<>
          <FilterSelect value={v.city} onChange={x => f.set({ city: x })} all="All cities" options={optionsFrom(suppliers, s => s.city)} />
          <FilterSelect value={v.ordered} onChange={x => f.set({ ordered: x })} all="Ordered or not" options={[{ value: 'yes', label: 'Has orders' }, { value: 'no', label: 'No orders yet' }]} />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        empty={{ icon: Truck, title: 'No suppliers yet', description: 'Add the vendors you buy fabric, lighting and hardware from.',
          action: <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add supplier</button> }}
      />

      {showForm && (
        <Modal title={editId ? 'Edit supplier' : 'Add supplier'} onClose={() => { setShowForm(false); setEditId(null) }}
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="supplier-form" className="btn-primary" disabled={saving || !form.name}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add supplier'}</button>
          </>}>
          <form id="supplier-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name" required className="sm:col-span-2"><input required value={form.name} onChange={set('name')} className="input" autoFocus /></Field>
            <Field label="Contact person"><input value={form.contact_name} onChange={set('contact_name')} className="input" /></Field>
            <Field label="Phone"><input type="tel" value={form.phone} onChange={set('phone')} className="input" inputMode="tel" /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={set('email')} className="input" /></Field>
            <Field label="City"><input value={form.city} onChange={set('city')} className="input" /></Field>
            <Field label="Address" className="sm:col-span-2"><textarea value={form.address} onChange={set('address')} rows={2} className="input resize-none" /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea value={form.notes} onChange={set('notes')} rows={2} className="input resize-none" /></Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
