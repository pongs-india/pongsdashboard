'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Truck } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, SearchInput, Modal, Field, Avatar } from '@/components/ui'
import { confirmDialog, toast } from '@/components/feedback'

interface Supplier {
  id: string; name: string; contact_name: string; email: string; phone: string; city: string; address: string; notes: string
}
const empty = (): Omit<Supplier, 'id'> => ({ name: '', contact_name: '', email: '', phone: '', city: '', address: '', notes: '' })

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/inventory/suppliers').then(r => r.json()).then(d => { setSuppliers(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (editId) {
      await fetch(`/api/inventory/suppliers/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    } else {
      await fetch('/api/inventory/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
    setShowForm(false); setForm(empty()); setEditId(null); load()
  }
  async function handleDelete(s: Supplier) {
    const ok = await confirmDialog({ title: 'Delete supplier', body: `"${s.name}" will be removed. Existing purchase orders keep their supplier name.`, confirmLabel: 'Delete supplier', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/inventory/suppliers/${s.id}`, { method: 'DELETE' })
    if (res.ok) toast('Supplier deleted'); else toast('Could not delete the supplier', { tone: 'error' })
    load()
  }
  function openEdit(s: Supplier) {
    setForm({ name: s.name, contact_name: s.contact_name ?? '', email: s.email ?? '', phone: s.phone ?? '', city: s.city ?? '', address: s.address ?? '', notes: s.notes ?? '' })
    setEditId(s.id); setShowForm(true)
  }
  const set = (k: keyof ReturnType<typeof empty>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const q = search.toLowerCase()
  const filtered = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q) || (s.contact_name ?? '').toLowerCase().includes(q))

  return (
    <div className="page">
      <PageHeader
        title="Suppliers"
        description="Vendors for fabric, lighting and hardware."
        actions={<button onClick={() => { setShowForm(true); setForm(empty()); setEditId(null) }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add supplier</button>}
      />

      <div className="table-wrap">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
          <span className="text-xs text-gray-500 pl-1">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</span>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, contact, city" />
        </div>
        {loading ? <LoadingRows rows={4} cols={4} /> : filtered.length === 0 ? (
          <EmptyState icon={Truck} title={suppliers.length ? 'No suppliers match' : 'No suppliers yet'}
            action={!suppliers.length ? <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add supplier</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th>Supplier</th><th className="hidden md:table-cell">Contact</th><th className="hidden lg:table-cell">Phone</th><th className="hidden lg:table-cell">Email</th><th className="hidden sm:table-cell">City</th><th className="w-20"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} size={28} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{s.name}</div>
                          {s.address && <div className="truncate text-xs text-gray-500 max-w-[260px]">{s.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">{s.contact_name || '—'}</td>
                    <td className="hidden lg:table-cell whitespace-nowrap">{s.phone ? <a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a> : '—'}</td>
                    <td className="hidden lg:table-cell">{s.email ? <a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a> : '—'}</td>
                    <td className="hidden sm:table-cell">{s.city || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="btn-ghost btn-icon" aria-label={`Edit ${s.name}`}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(s)} className="btn-ghost btn-icon text-gray-400 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${s.name}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editId ? 'Edit supplier' : 'Add supplier'} onClose={() => { setShowForm(false); setEditId(null) }}
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="supplier-form" className="btn-primary" disabled={saving || !form.name}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add supplier'}</button>
          </>}>
          <form id="supplier-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company name" required className="sm:col-span-2"><input required value={form.name} onChange={set('name')} className="input" autoFocus /></Field>
            <Field label="Contact person"><input value={form.contact_name} onChange={set('contact_name')} className="input" /></Field>
            <Field label="Phone"><input type="tel" value={form.phone} onChange={set('phone')} className="input" /></Field>
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
