'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ClipboardCheck } from 'lucide-react'
import { PageHeader, Modal, Field, Stat, StatGrid } from '@/components/ui'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'
import { fmtINR } from '@/lib/format'
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
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const flt = useFilters({ status: '', location: '', from: '', to: '' })
  const fv = flt.values

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/inventory/work-completions')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setJobs(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(editId ? `/api/inventory/work-completions/${editId}` : '/api/inventory/work-completions', {
      method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast('Could not save the job record. Check the details and try again.', { tone: 'error' }); return }
    toast(editId ? 'Job record updated' : 'Job record added')
    setShowForm(false); setForm(emptyForm()); setEditId(null); load()
  }
  async function handleDelete(j: WorkCompletion) {
    const ok = await confirmDialog({ title: 'Delete job record', body: `The record for "${j.project_name}" will be deleted. An administrator can restore it from the audit log for 30 days.`, confirmLabel: 'Delete record', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/inventory/work-completions/${j.id}`, { method: 'DELETE' })
    if (res.ok) toast('Job record deleted'); else toast('Could not delete the job record', { tone: 'error' })
    load()
  }
  function openEdit(j: WorkCompletion) {
    setForm({ project_name: j.project_name, client_name: j.client_name ?? '', location: j.location ?? '', completion_date: j.completion_date ?? '', status: j.status ?? 'completed', amount: j.amount ?? 0, notes: j.notes ?? '' })
    setEditId(j.id); setShowForm(true)
  }

  const rows = useMemo(() => jobs.filter(j =>
    (!fv.status || j.status === fv.status) && (!fv.location || j.location === fv.location) && inPeriod(j.completion_date, { from: fv.from, to: fv.to })), [jobs, fv])
  const cols: Col[] = [
    { key: 'completion_date', label: 'Completed', kind: 'date' },
    { key: 'project_name', label: 'Project', sub: { key: 'client_name', label: 'Client' }, render: r => <span className="font-medium">{String(r.project_name)}</span> },
    { key: 'location', label: 'Location', hideBelow: 'md' },
    { key: 'status', label: 'Status', kind: 'status', labels: Object.fromEntries(STATUSES) },
    { key: 'amount', label: 'Amount', kind: 'money', total: true },
    { key: 'notes', label: 'Notes', hideBelow: 'xl' },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Work completion"
        description="Record of finished jobs for material reconciliation."
        actions={<button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null) }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add job</button>}
      />

      <StatGrid cols={3}>
        <Stat label="Job records" value={loading ? null : rows.length} hint={loading ? undefined : `${rows.filter(j => j.status === 'completed').length} completed`} />
        <Stat label="Value" value={loading ? null : fmtINR(rows.reduce((s, j) => s + Number(j.amount || 0), 0))} hint={loading ? undefined : 'Across the filtered jobs'} />
        <Stat label="Pending or in progress" value={loading ? null : rows.filter(j => ['pending', 'in_progress'].includes(j.status)).length} hint={loading ? undefined : 'Not yet reconciled'} />
      </StatGrid>

      <DataTable
        title="Jobs"
        exportTitle="Work completion"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        initialSort={{ key: 'completion_date', dir: -1 }}
        searchPlaceholder="Search project, client, location"
        rowActions={r => [
          { icon: 'edit', label: `Edit ${r.project_name}`, onClick: () => openEdit(r as unknown as WorkCompletion) },
          { icon: 'trash', label: `Delete ${r.project_name}`, tone: 'danger', onClick: () => handleDelete(r as unknown as WorkCompletion) },
        ]}
        filters={<>
          <FilterSelect value={fv.status} onChange={x => flt.set({ status: x })} all="All statuses" options={STATUSES.map(([value, label]) => ({ value, label }))} />
          <FilterSelect value={fv.location} onChange={x => flt.set({ location: x })} all="All locations" className="w-full sm:w-52" options={optionsFrom(jobs, j => j.location)} />
          <DateRange label="Completed" from={fv.from} to={fv.to} onChange={(from, to) => flt.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={flt.active}
        onClearFilters={flt.clear}
        empty={{ icon: ClipboardCheck, title: 'No job records yet', description: 'Record finished jobs to reconcile the materials they used.',
          action: <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add job</button> }}
      />

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
