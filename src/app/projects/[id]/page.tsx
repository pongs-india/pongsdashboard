'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Pencil, Plus, Trash2, FileText, Receipt, Wallet, MessageSquare, HardHat, Play, CheckCircle2, ReceiptText, RotateCcw, ListChecks, UserPlus } from 'lucide-react'
import { StatusBadge, Badge, EmptyState, Modal, Field, PageLoading, Avatar, NextStep, type StepState } from '@/components/ui'
import ProjectFormModal, { PROJECT_STATUS_LABELS, teamMembersText, type Project as FormProject } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'
import { Select, DatePicker } from '@/components/controls'
import { confirmDialog, toast } from '@/components/feedback'

interface Project extends FormProject { created_at: string }
interface Payment { id: string; type: string; amount: number; payment_date: string; method: string; reference: string; notes: string }
interface Expense { id: string; category: string; description: string; amount: number; expense_date: string; paid_to: string; notes: string }
interface Checklist { id: string; phase: string; item: string; done: number; done_by: string; done_at: string; sort_order: number }
interface Update { id: string; note: string; status: string; created_at: string; created_by: string }

type Tab = 'overview' | 'payments' | 'checklist' | 'updates'
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'cheque', 'upi', 'card', 'other']
const EXPENSE_CATEGORIES = ['materials', 'labour', 'transport', 'tools', 'subcontract', 'other']
const PHASES = ['pre-install', 'install', 'post-install']
const PHASE_LABEL: Record<string, string> = { 'pre-install': 'Before installation', install: 'Installation', 'post-install': 'After installation' }
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—')

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [payments, setPayments] = useState<Payment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [contractValue, setContractValue] = useState(0)
  const [totalPaid, setTotalPaid] = useState(0)
  const [financeLoaded, setFinanceLoaded] = useState(false)
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [checklist, setChecklist] = useState<Checklist[]>([])
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [showPayModal, setShowPayModal] = useState(false)
  const [payForm, setPayForm] = useState({ type: 'payment', amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'bank_transfer', reference: '', notes: '' })
  const [showExpModal, setShowExpModal] = useState(false)
  const [expForm, setExpForm] = useState({ category: 'materials', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), paid_to: '', notes: '' })
  const [updateNote, setUpdateNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadProject = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`)
    if (!r.ok) { setProject(null); setLoading(false); return }
    const data = await r.json()
    const { materials: _m, updates: upd, ...proj } = data
    setProject(proj)
    setUpdates(upd || [])
    setLoading(false)
  }, [id])

  const loadPayments = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}/payments`).catch(() => null)
    const data = r?.ok ? await r.json().catch(() => null) : null
    if (!data) { toast('Payments could not be loaded', { tone: 'error' }); return }
    setFinanceLoaded(true)
    setPayments(data.payments || [])
    setExpenses(data.expenses || [])
    setContractValue(data.contractValue || 0)
    setTotalPaid(data.totalPaid || 0)
    setTotalExpenses(data.totalExpenses || 0)
  }, [id])

  const loadChecklist = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}/checklist`)
    const data = await r.json()
    setChecklist(Array.isArray(data) ? data : [])
  }, [id])

  useEffect(() => {
    loadProject()
    loadPayments()
    loadChecklist()
  }, [loadProject, loadPayments, loadChecklist])

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/projects/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payForm, amount: Number(payForm.amount) }) })
    setSaving(false)
    setShowPayModal(false)
    setPayForm({ type: 'payment', amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'bank_transfer', reference: '', notes: '' })
    loadPayments()
  }

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/projects/${id}/expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...expForm, amount: Number(expForm.amount) }) })
    setSaving(false)
    setShowExpModal(false)
    setExpForm({ category: 'materials', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), paid_to: '', notes: '' })
    loadPayments()
  }

  const deleteExpense = async (exp: Expense) => {
    const ok = await confirmDialog({ title: 'Delete expense', body: `"${exp.description}" will be removed from this project's costs.`, confirmLabel: 'Delete expense', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/projects/${id}/expenses`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expense_id: exp.id }) })
    if (res.ok) toast('Expense deleted'); else toast('Could not delete the expense', { tone: 'error' })
    loadPayments()
  }

  const toggleChecklist = async (itemId: string, done: boolean) => {
    setChecklist(prev => prev.map(c => c.id === itemId ? { ...c, done: done ? 1 : 0 } : c))
    await fetch(`/api/projects/${id}/checklist`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, done }) })
    loadChecklist()
  }

  const addUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!updateNote.trim()) return
    setSaving(true)
    await fetch(`/api/projects/${id}/updates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: updateNote }) })
    setSaving(false)
    setUpdateNote('')
    loadProject()
  }

  // One-click lifecycle moves from the Next step panel. The API expects the
  // whole record, so send the current project with the new status.
  const moveTo = async (status: string, message: string) => {
    if (!project) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const body = { ...project, status, completion_date: status === 'completed' && !project.completion_date ? today : project.completion_date }
    const res = await fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!res.ok) { toast('Could not update the project', { tone: 'error', description: res.status === 403 ? 'You do not have permission to edit projects.' : undefined }); return }
    toast(message)
    loadProject()
  }

  if (loading) return <PageLoading />
  if (!project) {
    return (
      <div className="card mt-8">
        <EmptyState icon={HardHat} title="Project not found" description="It may have been deleted, or you may not have access."
          action={<a href="/projects/all" className="btn-secondary">All projects</a>} />
      </div>
    )
  }

  const outstanding = contractValue - totalPaid
  const profit = contractValue - totalExpenses
  const profitPct = contractValue > 0 ? (profit / contractValue) * 100 : 0
  const paidPct = contractValue > 0 ? Math.min(100, (totalPaid / contractValue) * 100) : 0
  const checkDone = checklist.filter(c => c.done).length
  const team = teamMembersText(project.team_members)

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'payments', label: 'Payments and expenses', count: payments.length + expenses.length },
    { id: 'checklist', label: 'Checklist', count: checklist.length ? undefined : 0 },
    { id: 'updates', label: 'Updates', count: updates.length },
  ]

  return (
    <div className="page">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} label={PROJECT_STATUS_LABELS[project.status]} />
            {['urgent', 'high'].includes(project.priority) && <Badge tone={project.priority === 'urgent' ? 'danger' : 'warning'}>{cap(project.priority)} priority</Badge>}
          </div>
          <h1 className="mt-2 text-xl sm:text-[22px] font-semibold tracking-tight text-gray-900">{project.name}</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {[project.client_name, project.city, project.scheduled_date ? `Scheduled ${fmtDate(project.scheduled_date)}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {project.quote_id && <a href={`/quotes/${project.quote_id}/team`} className="btn-secondary"><FileText size={14} /> Source quote</a>}
          <button onClick={() => setEditing(true)} className="btn-secondary"><Pencil size={14} /> Edit project</button>
        </div>
      </div>

      <ProjectNextStep
        project={project}
        outstanding={contractValue - totalPaid}
        checkDone={checklist.filter(c => c.done).length}
        checkTotal={checklist.length}
        busy={saving}
        onMove={moveTo}
        onEdit={() => setEditing(true)}
        onPay={() => setShowPayModal(true)}
        onChecklist={() => setTab('checklist')}
      />

      {/* Financials */}
      <section className="card mb-6">
        <dl className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <Money label="Contract value" loading={!financeLoaded} value={fmtINR(contractValue)} hint={contractValue ? undefined : 'Not set on the project'} />
          <Money label="Received" loading={!financeLoaded} value={fmtINR(totalPaid)} hint={contractValue ? `${paidPct.toFixed(0)}% collected` : undefined} />
          <Money label="Outstanding" loading={!financeLoaded} value={fmtINR(outstanding)}
            tone={!contractValue ? undefined : outstanding > 0 ? 'warning' : 'success'}
            hint={!contractValue ? 'Set a contract value to track dues' : outstanding > 0 ? 'Due from client' : 'Fully paid'} />
          <Money label="Gross profit" loading={!financeLoaded} value={fmtINR(profit)} tone={!contractValue ? undefined : profit >= 0 ? 'success' : 'danger'}
            hint={contractValue ? `${profitPct.toFixed(0)}% after ${fmtINR(totalExpenses)} expenses` : `${fmtINR(totalExpenses)} expenses recorded`} />
        </dl>
        {contractValue > 0 && (
          <div className="px-5 pb-4">
            <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${paidPct}%` }} /></div>
          </div>
        )}
      </section>

      <nav className="tabs mb-5" aria-label="Project sections">
        {tabs.map(t => (
          <button key={t.id} type="button" className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'checklist' && checklist.length > 0
              ? <span className="text-xs text-gray-400 tabular-nums">{checkDone}/{checklist.length}</span>
              : t.count ? <span className="text-xs text-gray-400 tabular-nums">{t.count}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card">
            <div className="card-header"><h2 className="card-title">Details</h2></div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-5 text-[13px]">
              <Detail label="Client">{project.client_name || '—'}</Detail>
              <Detail label="Phone">{project.client_phone ? <a href={`tel:${project.client_phone}`} className="hover:underline">{project.client_phone}</a> : '—'}</Detail>
              <Detail label="Email">{project.client_email ? <a href={`mailto:${project.client_email}`} className="break-all hover:underline">{project.client_email}</a> : '—'}</Detail>
              <Detail label="City">{project.city || '—'}</Detail>
              <Detail label="Site address" wide>{project.site_address || '—'}</Detail>
              <Detail label="Scheduled">{fmtDate(project.scheduled_date)}</Detail>
              <Detail label="Completed">{fmtDate(project.completion_date)}</Detail>
              <Detail label="Team lead">{project.team_lead || '—'}</Detail>
              <Detail label="Team">{team || '—'}</Detail>
              <Detail label="Ceiling area">{project.ceiling_area_sqft ? `${project.ceiling_area_sqft} sqft` : '—'}</Detail>
              <Detail label="Priority">{cap(project.priority)}</Detail>
              {project.notes && <Detail label="Notes" wide><span className="whitespace-pre-line">{project.notes}</span></Detail>}
            </dl>
          </section>

          <div className="space-y-4">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Checklist</h2>
                <button className="card-link" onClick={() => setTab('checklist')}>Open</button>
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[22px] font-semibold tabular-nums text-gray-900">{checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0}%</span>
                  <span className="text-xs text-gray-500 tabular-nums">{checkDone} of {checklist.length} done</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-brand-600 transition-all" style={{ width: `${checklist.length ? (checkDone / checklist.length) * 100 : 0}%` }} />
                </div>
                <ul className="mt-4 space-y-2">
                  {PHASES.map(ph => {
                    const items = checklist.filter(c => c.phase === ph)
                    const done = items.filter(c => c.done).length
                    return (
                      <li key={ph} className="flex items-center justify-between text-[13px]">
                        <span className="text-gray-700">{PHASE_LABEL[ph]}</span>
                        <span className="tabular-nums text-gray-500">{done}/{items.length}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Latest update</h2>
                <button className="card-link" onClick={() => setTab('updates')}>All updates</button>
              </div>
              {updates[0] ? (
                <div className="p-5">
                  <p className="text-[13px] text-gray-800 whitespace-pre-line">{updates[0].note}</p>
                  <p className="mt-2 text-xs text-gray-500">{fmtDate(updates[0].created_at)}{updates[0].created_by ? ` · ${updates[0].created_by}` : ''}</p>
                </div>
              ) : <EmptyState icon={MessageSquare} title="No updates yet" description="Post site progress so everyone knows where the job stands."
                  action={<button className="btn-secondary btn-sm" onClick={() => setTab('updates')}><Plus size={14} /> Post an update</button>} compact />}
            </section>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-4">
          <section className="table-wrap">
            <div className="card-header">
              <h2 className="card-title">Payments received</h2>
              <button onClick={() => setShowPayModal(true)} className="btn-secondary btn-sm"><Plus size={14} /> Record payment</button>
            </div>
            {payments.length === 0 ? <EmptyState icon={Wallet} title="No payments recorded" description="Record advances and payments as they arrive to track what is still due." compact /> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Date</th><th>Type</th><th>Method</th><th className="hidden sm:table-cell">Reference</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap tabular-nums">{fmtDate(p.payment_date)}</td>
                        <td>{cap(p.type)}</td>
                        <td>{cap(p.method)}</td>
                        <td className="hidden sm:table-cell text-gray-500">{p.reference || '—'}</td>
                        <td className="num font-medium text-gray-900">{fmtINR(Number(p.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {payments.length > 0 && <div className="table-footer"><span>{payments.length} payment{payments.length !== 1 ? 's' : ''}</span><span className="tabular-nums">Total {fmtINR(totalPaid)}</span></div>}
          </section>

          <section className="table-wrap">
            <div className="card-header">
              <h2 className="card-title">Expenses</h2>
              <button onClick={() => setShowExpModal(true)} className="btn-secondary btn-sm"><Plus size={14} /> Add expense</button>
            </div>
            {expenses.length === 0 ? <EmptyState icon={Receipt} title="No expenses recorded" description="Add material, labour and transport costs to see the real profit on this job." compact /> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="hidden sm:table-cell">Paid to</th><th className="num">Amount</th><th className="w-12"><span className="sr-only">Delete</span></th></tr></thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap tabular-nums">{fmtDate(e.expense_date)}</td>
                        <td className="text-gray-900">{e.description}</td>
                        <td>{cap(e.category)}</td>
                        <td className="hidden sm:table-cell text-gray-500">{e.paid_to || '—'}</td>
                        <td className="num font-medium text-gray-900">{fmtINR(Number(e.amount))}</td>
                        <td className="text-right">
                          <button onClick={() => deleteExpense(e)} className="btn-ghost btn-icon text-gray-400 hover:text-red-700 hover:bg-red-50" aria-label="Delete expense"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {expenses.length > 0 && <div className="table-footer"><span>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</span><span className="tabular-nums">Total {fmtINR(totalExpenses)}</span></div>}
          </section>
        </div>
      )}

      {tab === 'checklist' && (
        <div className="grid gap-4 lg:grid-cols-3">
          {PHASES.map(phase => {
            const items = checklist.filter(c => c.phase === phase).sort((a, b) => a.sort_order - b.sort_order)
            const done = items.filter(c => c.done).length
            return (
              <section key={phase} className="card self-start">
                <div className="card-header">
                  <h2 className="card-title">{PHASE_LABEL[phase]}</h2>
                  <span className="text-xs text-gray-500 tabular-nums">{done}/{items.length}</span>
                </div>
                {items.length === 0 ? <p className="px-5 py-6 text-center text-xs text-gray-500">No items</p> : (
                  <ul className="divide-y divide-gray-100">
                    {items.map(item => (
                      <li key={item.id}>
                        <label className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={!!item.done} onChange={e => toggleChecklist(item.id, e.target.checked)} className="checkbox mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13px] ${item.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.item}</span>
                            {!!item.done && item.done_at && <span className="block text-2xs text-gray-400 mt-0.5">{fmtDate(item.done_at)}{item.done_by ? ` · ${item.done_by}` : ''}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {tab === 'updates' && (
        <div className="max-w-3xl">
          <form onSubmit={addUpdate} className="card p-4">
            <label htmlFor="update-note" className="label">Post an update</label>
            <textarea id="update-note" value={updateNote} onChange={e => setUpdateNote(e.target.value)}
              placeholder="Progress on site, blockers, what happens next" rows={3} className="input resize-none" />
            <div className="mt-3 flex justify-end">
              <button type="submit" disabled={saving || !updateNote.trim()} className="btn-primary">{saving ? 'Posting…' : 'Post update'}</button>
            </div>
          </form>
          {updates.length === 0 ? (
            <div className="card mt-4"><EmptyState icon={MessageSquare} title="No updates yet" description="Site progress notes from the team appear here." compact /></div>
          ) : (
            <ol className="mt-5 space-y-0">
              {updates.map((u, i) => (
                <li key={u.id} className="relative flex gap-3 pb-5">
                  {i < updates.length - 1 && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-gray-200" />}
                  <Avatar name={u.created_by || 'Team'} size={28} />
                  <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-800">{u.created_by || 'Team'}</span> · {fmtDate(u.created_at)}
                    </p>
                    <p className="mt-1 text-[13px] text-gray-800 whitespace-pre-line">{u.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {showPayModal && (
        <Modal title="Record payment" onClose={() => setShowPayModal(false)} width="max-w-md"
          footer={<>
            <button type="button" onClick={() => setShowPayModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" form="pay-form" disabled={saving || !payForm.amount} className="btn-primary">{saving ? 'Saving…' : 'Record payment'}</button>
          </>}>
          <form id="pay-form" onSubmit={addPayment} className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={payForm.type} onChange={v => setPayForm(f => ({ ...f, type: v }))} ariaLabel="Payment type" options={[
                { value: 'payment', label: 'Payment' },
                { value: 'advance', label: 'Advance' },
                { value: 'final', label: 'Final payment' },
              ]} />
            </Field>
            <Field label="Amount (₹)" required>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} className="input tabular-nums" autoFocus />
            </Field>
            <Field label="Date">
              <DatePicker value={payForm.payment_date} onChange={v => setPayForm(f => ({ ...f, payment_date: v }))} clearable={false} ariaLabel="Payment date" />
            </Field>
            <Field label="Method">
              <Select value={payForm.method} onChange={v => setPayForm(f => ({ ...f, method: v }))} ariaLabel="Payment method"
                options={PAYMENT_METHODS.map(m => ({ value: m, label: m === 'upi' ? 'UPI' : cap(m) }))} />
            </Field>
            <Field label="Reference" className="col-span-2">
              <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} className="input" placeholder="UTR or cheque number" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} className="input" />
            </Field>
          </form>
        </Modal>
      )}

      {showExpModal && (
        <Modal title="Add expense" onClose={() => setShowExpModal(false)} width="max-w-md"
          footer={<>
            <button type="button" onClick={() => setShowExpModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" form="exp-form" disabled={saving || !expForm.description || !expForm.amount} className="btn-primary">{saving ? 'Saving…' : 'Add expense'}</button>
          </>}>
          <form id="exp-form" onSubmit={addExpense} className="grid grid-cols-2 gap-4">
            <Field label="Description" required className="col-span-2">
              <input value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} className="input" autoFocus />
            </Field>
            <Field label="Category">
              <Select value={expForm.category} onChange={v => setExpForm(f => ({ ...f, category: v }))} ariaLabel="Category"
                options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: cap(c) }))} />
            </Field>
            <Field label="Amount (₹)" required>
              <input type="number" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} className="input tabular-nums" />
            </Field>
            <Field label="Date">
              <DatePicker value={expForm.expense_date} onChange={v => setExpForm(f => ({ ...f, expense_date: v }))} clearable={false} ariaLabel="Expense date" />
            </Field>
            <Field label="Paid to">
              <input value={expForm.paid_to} onChange={e => setExpForm(f => ({ ...f, paid_to: e.target.value }))} className="input" />
            </Field>
          </form>
        </Modal>
      )}

      {editing && (
        <ProjectFormModal initial={project} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadProject(); loadPayments() }} />
      )}
    </div>
  )
}

function Money({ label, value, hint, tone, loading }: { label: string; value: string; hint?: string; tone?: 'success' | 'warning' | 'danger'; loading?: boolean }) {
  const hintCls = tone === 'success' ? 'text-success-700' : tone === 'warning' ? 'text-amber-700' : tone === 'danger' ? 'text-red-700' : 'text-gray-500'
  return (
    <div className="px-5 py-4">
      <dt className="text-[13px] font-medium text-gray-500">{label}</dt>
      {loading ? (
        <dd className="mt-2 space-y-2" aria-label="Loading"><span className="skeleton block h-6 w-24" /><span className="skeleton block h-3 w-28" /></dd>
      ) : (
        <>
          <dd className="mt-1 text-xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</dd>
          {hint && <dd className={`mt-0.5 text-xs ${hintCls}`}>{hint}</dd>}
        </>
      )}
    </div>
  )
}

function Detail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900">{children}</dd>
    </div>
  )
}

const LIFECYCLE = ['scheduled', 'in_progress', 'completed', 'invoiced'] as const

function ProjectNextStep({ project, outstanding, checkDone, checkTotal, busy, onMove, onEdit, onPay, onChecklist }: {
  project: Project
  outstanding: number
  checkDone: number
  checkTotal: number
  busy: boolean
  onMove: (status: string, message: string) => void
  onEdit: () => void
  onPay: () => void
  onChecklist: () => void
}) {
  const status = project.status
  const idx = LIFECYCLE.indexOf(status as typeof LIFECYCLE[number])
  const paid = ['completed', 'invoiced'].includes(status) && outstanding <= 0
  const steps: { label: string; state: StepState }[] = [
    ...LIFECYCLE.map((s, i) => ({
      label: PROJECT_STATUS_LABELS[s],
      state: (idx < 0 ? 'upcoming' : i < idx ? 'done' : i === idx ? (s === 'invoiced' ? 'done' : 'current') : 'upcoming') as StepState,
    })),
    { label: 'Paid', state: paid && status === 'invoiced' ? 'done' : status === 'invoiced' ? 'current' : 'upcoming' },
  ]
  if (status === 'on_hold' || status === 'cancelled') steps.forEach(s => { if (s.state === 'current') s.state = 'upcoming' })

  const today = new Date().toISOString().slice(0, 10)
  const date = project.scheduled_date ? fmtDate(project.scheduled_date) : null
  const overdue = !!project.scheduled_date && project.scheduled_date < today

  if (status === 'on_hold') {
    return <NextStep className="mb-6" steps={steps} tone="attention" title="This project is on hold"
      description="Resume it when the site is ready. It returns to Scheduled so the team can plan the installation."
      actions={<button className="btn-primary" disabled={busy} onClick={() => onMove('scheduled', 'Project resumed')}><RotateCcw size={14} /> Resume project</button>} />
  }
  if (status === 'cancelled') {
    return <NextStep className="mb-6" steps={steps} tone="done" title="This project was cancelled" description="No further action is needed." />
  }
  if (status === 'scheduled') {
    if (!project.scheduled_date || !project.team_lead) {
      return <NextStep className="mb-6" steps={steps}
        title={!project.scheduled_date ? 'Set an installation date and team lead' : 'Assign a team lead'}
        description="The schedule and team lead tell everyone who installs where, and when."
        actions={<button className="btn-primary" onClick={onEdit}><UserPlus size={14} /> Plan installation</button>} />
    }
    return <NextStep className="mb-6" steps={steps} tone={overdue ? 'attention' : 'default'}
      title={overdue ? `The installation date (${date}) has passed` : `Installation on ${date} with ${project.team_lead}`}
      description={overdue ? 'Start the installation if the team is on site, or change the date.' : 'When the team starts on site, mark the installation as started.'}
      actions={<>
        {overdue && <button className="btn-secondary" onClick={onEdit}>Change date</button>}
        <button className="btn-primary" disabled={busy} onClick={() => onMove('in_progress', 'Installation started')}><Play size={14} /> Start installation</button>
      </>} />
  }
  if (status === 'in_progress') {
    const left = checkTotal - checkDone
    return <NextStep className="mb-6" steps={steps}
      title="Installation is under way"
      description={checkTotal > 0
        ? (left > 0 ? `${left} of ${checkTotal} checklist items still open. Mark the project completed once the site is handed over.` : 'Every checklist item is done. Mark the project completed.')
        : 'Mark the project completed once the site is handed over.'}
      actions={<>
        {checkTotal > 0 && left > 0 && <button className="btn-secondary" onClick={onChecklist}><ListChecks size={14} /> Open checklist</button>}
        <button className="btn-primary" disabled={busy} onClick={() => onMove('completed', 'Project marked completed')}><CheckCircle2 size={14} /> Mark completed</button>
      </>} />
  }
  if (status === 'completed') {
    return <NextStep className="mb-6" steps={steps}
      title="Send the invoice"
      description={outstanding > 0 ? `${fmtINR(outstanding)} is still due. Mark the project invoiced once the invoice has gone out.` : 'Payment is already complete. Mark the project invoiced to close it.'}
      actions={<>
        {outstanding > 0 && <button className="btn-secondary" onClick={onPay}><Wallet size={14} /> Record payment</button>}
        <button className="btn-primary" disabled={busy} onClick={() => onMove('invoiced', 'Project marked invoiced')}><ReceiptText size={14} /> Mark invoiced</button>
      </>} />
  }
  if (status === 'invoiced' && outstanding > 0) {
    return <NextStep className="mb-6" steps={steps}
      title={`Collect ${fmtINR(outstanding)} from ${project.client_name || 'the client'}`}
      description="Record each payment as it arrives. The project closes once the balance reaches zero."
      actions={<button className="btn-primary" onClick={onPay}><Wallet size={14} /> Record payment</button>} />
  }
  return <NextStep className="mb-6" steps={steps} tone="done" title="Installed, invoiced and fully paid" description="Nothing left to do on this project." />
}
