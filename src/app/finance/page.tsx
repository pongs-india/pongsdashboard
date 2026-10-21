'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import Gate from '@/components/Gate'
import { PageHeader, Stat, StatGrid } from '@/components/ui'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR } from '@/lib/format'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'

interface ProjectFinance {
  id: string; name: string; client_name: string; status: string
  contract_value: number; total_paid: number; total_expenses: number; created_at: string
}

function FinanceInner() {
  const [projects, setProjects] = useState<ProjectFinance[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const f = useFilters({ view: '', status: '', client: '', from: '', to: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/finance')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(data => { setProjects(Array.isArray(data) ? data : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const all = useMemo(() => projects.map(p => {
    const cv = Number(p.contract_value || 0), paid = Number(p.total_paid || 0), exp = Number(p.total_expenses || 0)
    return { ...p, outstanding: Math.max(0, cv - paid), collected: cv > 0 ? Math.min(100, (paid / cv) * 100) : null, profit: cv - exp, margin: cv > 0 ? ((cv - exp) / cv) * 100 : null, created: String(p.created_at ?? '').slice(0, 10) }
  }), [projects])
  // Everything but the collection view narrows the tab counts too.
  const base = useMemo(() => all.filter(p =>
    (!v.status || p.status === v.status) && (!v.client || p.client_name === v.client) && inPeriod(p.created, { from: v.from, to: v.to })), [all, v.status, v.client, v.from, v.to])
  const rows = useMemo(() => base.filter(p => !v.view || (v.view === 'outstanding' ? p.outstanding > 0 : p.outstanding <= 0 && Number(p.contract_value) > 0)), [base, v.view])

  const contract = rows.reduce((s, p) => s + Number(p.contract_value || 0), 0)
  const received = rows.reduce((s, p) => s + Number(p.total_paid || 0), 0)
  const expenses = rows.reduce((s, p) => s + Number(p.total_expenses || 0), 0)
  const outstanding = rows.reduce((s, p) => s + p.outstanding, 0)

  const cols: Col[] = [
    { key: 'name', label: 'Project', sub: { key: 'client_name', label: 'Client' }, render: r => <a href={`/projects/${r.id}`}>{String(r.name)}</a> },
    { key: 'status', label: 'Status', kind: 'status', labels: PROJECT_STATUS_LABELS, hideBelow: 'md' },
    { key: 'contract_value', label: 'Contract', kind: 'money', total: true },
    { key: 'total_paid', label: 'Received', kind: 'money', total: true, hideBelow: 'lg' },
    { key: 'collected', label: 'Collected', kind: 'percent', hideBelow: 'lg', className: 'w-[15%]', render: r => r.collected === null ? <span className="text-faint">—</span> : (
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-track"><div className={`h-1.5 rounded-full ${Number(r.collected) >= 100 ? 'bg-success-fill' : 'bg-brand'}`} style={{ width: `${r.collected}%` }} /></div>
        <span className="w-9 text-right text-[12px] tabular-nums text-faint">{Math.round(Number(r.collected))}%</span>
      </div>
    ) },
    { key: 'outstanding', label: 'Outstanding', kind: 'money', total: true, render: r => Number(r.outstanding) > 0 ? <span className="font-medium">{fmtINR(Number(r.outstanding))}</span> : <span className="text-success">Paid</span> },
    { key: 'total_expenses', label: 'Expenses', kind: 'money', total: true, hideBelow: 'xl' },
    { key: 'profit', label: 'Gross profit', kind: 'money', total: true, render: r => (
      <span className="whitespace-nowrap"><span className={`font-medium ${Number(r.profit) < 0 ? 'text-danger' : ''}`}>{fmtINR(Number(r.profit))}</span>{r.margin !== null && <span className="ml-1.5 text-[12px] text-faint">{Math.round(Number(r.margin))}%</span>}</span>
    ) },
  ]

  return (
    <div className="page">
      <PageHeader title="Finance" description="Collections, expenses and profit across every project." />

      <StatGrid cols={5}>
        <Stat label="Contract value" value={loading ? null : fmtINR(contract)} hint={loading ? undefined : `${rows.length} projects`} />
        <Stat label="Received" value={loading ? null : fmtINR(received)} hint={loading ? undefined : contract ? `${Math.round((received / contract) * 100)}% collected` : 'Nothing contracted'} />
        <Stat label="Outstanding" value={loading ? null : fmtINR(outstanding)} hint={loading ? undefined : 'Due from clients'} tone={outstanding > 0 ? 'warning' : 'neutral'} />
        <Stat label="Expenses" value={loading ? null : fmtINR(expenses)} hint={loading ? undefined : 'Recorded against projects'} />
        <Stat label="Gross profit" value={loading ? null : fmtINR(contract - expenses)}
          hint={loading ? undefined : `Cash position ${fmtINR(received - expenses)}`} tone={contract - expenses >= 0 ? 'success' : 'danger'} />
      </StatGrid>

      <div className="seg" role="group" aria-label="Collection">
        {[['', 'All projects', base.length], ['outstanding', 'With balance due', base.filter(p => p.outstanding > 0).length], ['paid', 'Fully paid', base.filter(p => p.outstanding <= 0 && Number(p.contract_value) > 0).length]].map(([key, label, n]) => (
          <button key={String(key)} type="button" aria-pressed={v.view === key} data-active={v.view === key} onClick={() => f.set({ view: String(key) })}>
            {label} {!loading && <span className="ml-1 tabular-nums opacity-70">{n}</span>}
          </button>
        ))}
      </div>

      <DataTable
        title="Project finances"
        exportTitle="Finance"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/projects/${r.id}`}
        initialSort={{ key: 'outstanding', dir: -1 }}
        searchPlaceholder="Search project or client"
        filters={<>
          <FilterSelect value={v.status} onChange={x => f.set({ status: x })} all="All project statuses" className="w-full sm:w-48" options={PROJECT_STATUSES.map(s => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
          <FilterSelect value={v.client} onChange={x => f.set({ client: x })} all="All clients" className="w-full sm:w-52" options={optionsFrom(projects, p => p.client_name)} />
          <DateRange label="Project created" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        note={[v.view === 'outstanding' ? 'With balance due' : v.view === 'paid' ? 'Fully paid' : '', v.status && PROJECT_STATUS_LABELS[v.status], v.client, (v.from || v.to) && `Created ${v.from || 'start'} to ${v.to || 'today'}`].filter(Boolean).join(' · ') || undefined}
        empty={{ icon: Wallet, title: 'No projects yet', description: 'Project payments and expenses roll up here.' }}
        summary={visible => `Outstanding ${fmtINR(visible.reduce((s, p) => s + Number(p.outstanding || 0), 0))}`}
      />
    </div>
  )
}

export default function FinancePage() {
  return <Gate module="finance"><FinanceInner /></Gate>
}
