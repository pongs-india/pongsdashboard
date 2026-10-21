'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, HardHat } from 'lucide-react'
import { PageHeader, Badge } from '@/components/ui'
import ProjectFormModal, { EMPTY_PROJECT, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PRIORITIES, type Project } from '@/components/ProjectFormModal'
import { fmtINR } from '@/lib/format'
import { confirmDialog, toast } from '@/components/feedback'
import { useNewParam } from '@/lib/useNewParam'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' }
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export default function AllProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<Project | null>(null)
  const f = useFilters({ status: '', priority: '', city: '', lead: '', from: '', to: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/projects')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])
  useNewParam(() => setEditing({ ...EMPTY_PROJECT, scheduled_date: new Date().toISOString().slice(0, 10) }))

  const base = useMemo(() => projects.filter(p =>
    (!v.priority || p.priority === v.priority) && (!v.city || p.city === v.city) && (!v.lead || p.team_lead === v.lead) &&
    inPeriod(p.scheduled_date, { from: v.from, to: v.to })), [projects, v])
  const rows = useMemo(() => (v.status ? base.filter(p => p.status === v.status) : base), [base, v.status])

  async function del(p: Project) {
    const ok = await confirmDialog({ title: 'Delete project', body: `"${p.name}" and its payments, expenses and checklist will be deleted. An administrator can restore it from the audit log for 30 days.`, confirmLabel: 'Delete project', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    if (res.ok) toast('Project deleted'); else toast('Could not delete the project', { tone: 'error' })
    load()
  }

  const cols: Col[] = [
    { key: 'name', label: 'Project', sub: { key: 'client_name', label: 'Client' }, render: r => <a href={`/projects/${r.id}`}>{String(r.name)}</a> },
    { key: 'city', label: 'City', hideBelow: 'md' },
    { key: 'status', label: 'Status', kind: 'status', labels: PROJECT_STATUS_LABELS, value: r => PROJECT_STATUS_LABELS[String(r.status)] ?? String(r.status), sortValue: r => PROJECT_STATUSES.indexOf(String(r.status)),
      render: r => <Badge tone={r.status === 'completed' || r.status === 'invoiced' ? 'success' : r.status === 'in_progress' ? 'info' : r.status === 'on_hold' ? 'warning' : 'neutral'} dot>{PROJECT_STATUS_LABELS[String(r.status)] ?? String(r.status)}</Badge> },
    { key: 'scheduled_date', label: 'Scheduled', kind: 'date', hideBelow: 'lg' },
    { key: 'completion_date', label: 'Completed', kind: 'date', hideBelow: 'xl' },
    { key: 'team_lead', label: 'Team lead', hideBelow: 'lg' },
    { key: 'priority', label: 'Priority', hideBelow: 'xl', value: r => cap(String(r.priority || 'normal')), sortValue: r => PRIORITY_RANK[String(r.priority)] ?? 9,
      render: r => <Badge tone={PRIORITY_TONE[String(r.priority)] ?? 'neutral'}>{cap(String(r.priority || 'normal'))}</Badge> },
    { key: 'ceiling_area_sqft', label: 'Area (sqft)', kind: 'int', hideBelow: 'sm', total: true },
    { key: 'contract_value', label: 'Value', kind: 'money', total: true },
  ]

  return (
    <div className="page">
      <PageHeader
        title="All projects"
        description="Every installation project, current and past."
        actions={<button onClick={() => setEditing({ ...EMPTY_PROJECT, scheduled_date: new Date().toISOString().slice(0, 10) })} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New project</button>}
      />

      <div className="seg" role="group" aria-label="Status">
        <button type="button" aria-pressed={!v.status} data-active={!v.status} onClick={() => f.set({ status: '' })}>All {!loading && <span className="ml-1 tabular-nums opacity-70">{base.length}</span>}</button>
        {PROJECT_STATUSES.map(s => (
          <button key={s} type="button" aria-pressed={v.status === s} data-active={v.status === s} onClick={() => f.set({ status: v.status === s ? '' : s })}>
            {PROJECT_STATUS_LABELS[s]} {!loading && <span className="ml-1 tabular-nums opacity-70">{base.filter(p => p.status === s).length}</span>}
          </button>
        ))}
      </div>

      <DataTable
        title="Projects"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/projects/${r.id}`}
        initialSort={{ key: 'scheduled_date', dir: -1 }}
        searchPlaceholder="Search project, client, city"
        rowActions={r => [
          { icon: 'open', label: `Open ${r.name}`, href: `/projects/${r.id}` },
          { icon: 'edit', label: `Edit ${r.name}`, onClick: () => setEditing(r as unknown as Project) },
          { icon: 'trash', label: `Delete ${r.name}`, tone: 'danger', onClick: () => del(r as unknown as Project) },
        ]}
        filters={<>
          <FilterSelect value={v.priority} onChange={x => f.set({ priority: x })} all="Any priority" className="w-full sm:w-40" options={PRIORITIES.map(p => ({ value: p, label: cap(p) }))} />
          <FilterSelect value={v.city} onChange={x => f.set({ city: x })} all="All cities" options={optionsFrom(projects, p => p.city)} />
          <FilterSelect value={v.lead} onChange={x => f.set({ lead: x })} all="All team leads" className="w-full sm:w-48" options={optionsFrom(projects, p => p.team_lead)} />
          <DateRange label="Scheduled" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        note={[v.status && PROJECT_STATUS_LABELS[v.status], v.priority && cap(v.priority), v.city, v.lead, (v.from || v.to) && `Scheduled ${v.from || 'start'} to ${v.to || 'today'}`].filter(Boolean).join(' · ') || undefined}
        empty={{ icon: HardHat, title: 'No projects yet', description: 'Create a project, or convert an approved quote into one.',
          action: <button onClick={() => setEditing({ ...EMPTY_PROJECT })} className="btn-primary btn-sm"><Plus size={14} /> New project</button> }}
        summary={visible => `${fmtINR(visible.reduce((s, p) => s + Number(p.contract_value || 0), 0))} contracted`}
      />

      {editing && (
        <ProjectFormModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}
