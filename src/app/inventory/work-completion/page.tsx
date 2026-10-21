'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ClipboardCheck } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, StatusBadge, Modal, Field, SearchInput } from '@/components/ui'
import { fmtINR, fmtDate } from '@/lib/format'
import { Select, DatePicker } from '@/components/controls'
import { confirmDialog, toast } from '@/components/feedback'

interface WorkCompletion {
  id: string; project_name: string; client_name: string; location: string
  completion_date: string; status: string; amount: number; notes: string
}
const emptyForm = () => ({ project_name: '', client_name: '', location: '', completion_date: new Date().toISOString().slice(0, 10), status: 'completed', amount: 0, notes: '' })
const STATUSES: [string, string][] = [['completed', 'Completed'], ['in_progress', 'In progress'], ['pending', 'Pending'], ['cancelled', 'Cancelled']]

export default function WorkCompletionPage() {
  const [jobs, setJobs] = useState<WorkCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/inventory/work-completions').then(r => r.json()).then(d => { setJobs(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (editId) {
      await fetch(`/api/inventory/work-completions/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    } else {
      await fetch('/api/inventory/work-completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
    setShowForm(false); setForm(emptyForm()); setEditId(null); load()
  }
  async function handleDelete(j: WorkCompletion) {
    const ok = await confirmDialog({ title: 'Delete job record', body: `The record for "${j.project_name}" will be permanently removed.`, confirmLabel: 'Delete record', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/inventory/work-completions/${j.id}`, { method: 'DELETE' })
    if (res.ok) toast('Job record deleted'); else toast('Could not delete the job record', { tone: 'error' })
    load()
  }
  function openEdit(j: WorkCompletion) {
    setForm({ project_name: j.project_name, client_name: j.client_name ?? '', location: j.location ?? '', completion_date: j.completion_date ?? '', status: j.status ?? 'completed', amount: j.amount ?? 0, notes: j.notes ?? '' })
    setEditId(j.id); setShowForm(true)
  }

  const q = search.toLowerCase()
  const filtered = jobs.filter(j => !q || j.project_name.toLowerCase().includes(q) || (j.client_name ?? '').toLowerCase().includes(q) || (j.location ?? '').toLowerCase().includes(q))

  return (
    <div className="page">
      <PageHeader
        title="Work completion"
        description="Record of finished jobs for material reconciliation."
        actions={<button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null) }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add job</button>}
      />

      <div className="table-wrap">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
          <span className="text-xs text-gray-500 pl-1">{jobs.length} job record{jobs.length !== 1 ? 's' : ''}</span>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search project, client, location" />
        </div>
        {loading ? <LoadingRows rows={4} cols={5} /> : filtered.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={jobs.length ? 'No jobs match' : 'No job records yet'}
            action={!jobs.length ? <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add job</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th>Completed</th><th>Project</th><th className="hidden md:table-cell">Location</th><th>Status</th><th className="num">Amount</th><th className="w-20"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {filtered.map(j => (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(j.completion_date)}</td>
                    <td><div className="font-medium text-gray-900">{j.project_name}</div>{j.client_name && <div className="text-xs text-gray-500">{j.client_name}</div>}</td>
                    <td className="hidden md:table-cell">{j.location || '—'}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td className="num font-medium text-gray-900">{j.amount ? fmtINR(j.amount) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => openEdit(j)} className="btn-ghost btn-icon" aria-label={`Edit ${j.project_name}`}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(j)} className="btn-ghost btn-icon text-gray-400 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${j.project_name}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editId ? 'Edit job record' : 'Add job record'} onClose={() => { setShowForm(false); setEditId(null) }}
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="job-form" className="btn-primary" disabled={saving || !form.project_name}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add job'}</button>
          </>}>
          <form id="job-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Project" required className="sm:col-span-2"><input required value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className="input" autoFocus /></Field>
            <Field label="Client"><input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input" /></Field>
            <Field label="Location"><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="input" /></Field>
            <Field label="Completion date"><DatePicker value={form.completion_date} onChange={v => setForm(f => ({ ...f, completion_date: v }))} ariaLabel="Completion date" /></Field>
            <Field label="Amount (₹)"><input type="number" min="0" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} className="input tabular-nums" /></Field>
            <Field label="Status" className="sm:col-span-2">
              <Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} ariaLabel="Status"
                options={STATUSES.map(([v, l]) => ({ value: v, label: l }))} />
            </Field>
            <Field label="Notes" className="sm:col-span-2"><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none" /></Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
