'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, CalendarClock } from 'lucide-react'
import { PageHeader, Stat, StatGrid, statusDot } from '@/components/ui'
import ProjectFormModal, { EMPTY_PROJECT, PROJECT_STATUS_LABELS, PRIORITIES, type Project } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, FilterBar, optionsFrom } from '@/components/filters'

const PIPELINE = ['scheduled', 'in_progress', 'completed', 'invoiced'] as const
const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const f = useFilters({ city: '', lead: '', priority: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/projects')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const scoped = useMemo(() => projects.filter(p =>
    (!v.city || p.city === v.city) && (!v.lead || p.team_lead === v.lead) && (!v.priority || p.priority === v.priority)), [projects, v])

  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)
  const active = scoped.filter(p => !['completed', 'invoiced', 'cancelled'].includes(p.status))
  const completedMonth = scoped.filter(p => p.status === 'completed' && p.completion_date?.startsWith(thisMonth))
  const invoiced = scoped.filter(p => p.status === 'invoiced')
  const upcoming = scoped
    .filter(p => p.scheduled_date >= today && p.scheduled_date <= nextWeek && ['scheduled', 'in_progress'].includes(p.status))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  const cols: Col[] = [
    { key: 'scheduled_date', label: 'Date', kind: 'date' },
    { key: 'name', label: 'Project', sub: { key: 'client_name', label: 'Client' }, render: r => <a href={`/projects/${r.id}`}>{String(r.name)}</a> },
    { key: 'city', label: 'City', hideBelow: 'sm' },
    { key: 'team_lead', label: 'Team lead', render: r => r.team_lead ? <>{String(r.team_lead)}</> : <span className="text-faint">Unassigned</span> },
    { key: 'status', label: 'Status', kind: 'status', labels: PROJECT_STATUS_LABELS, hideBelow: 'md' },
    { key: 'contract_value', label: 'Value', kind: 'money', total: true },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        description="Installation pipeline from scheduling to invoicing."
        actions={<button onClick={() => setCreating(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New project</button>}
      />

      <FilterBar active={f.active} onClear={f.clear}>
        <FilterSelect value={v.city} onChange={x => f.set({ city: x })} all="All cities" options={optionsFrom(projects, p => p.city)} />
        <FilterSelect value={v.lead} onChange={x => f.set({ lead: x })} all="All team leads" className="w-full sm:w-48" options={optionsFrom(projects, p => p.team_lead)} />
        <FilterSelect value={v.priority} onChange={x => f.set({ priority: x })} all="Any priority" className="w-full sm:w-40" options={PRIORITIES.map(p => ({ value: p, label: cap(p) }))} />
      </FilterBar>

      {loadError && <div className="alert-error" role="alert"><span><span className="font-medium">Projects could not be loaded.</span> {loadError} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div>}

      <StatGrid>
        <Stat label="Active projects" value={loading ? null : active.length} href="/projects/all"
          hint={loading ? undefined : `${fmtINR(active.reduce((s, p) => s + Number(p.contract_value || 0), 0))} contracted`} />
        <Stat label="Installs next 7 days" value={loading ? null : upcoming.length} href="/projects/calendar"
          hint={loading ? undefined : upcoming[0] ? `Next: ${upcoming[0].name}` : 'Nothing scheduled'} />
        <Stat label="Completed this month" value={loading ? null : completedMonth.length} hint={loading ? undefined : 'By completion date'} href="/projects/completed" />
        <Stat label="Invoiced value" value={loading ? null : fmtINR(invoiced.reduce((s, p) => s + Number(p.contract_value || 0), 0))}
          hint={loading ? undefined : `${invoiced.length} project${invoiced.length !== 1 ? 's' : ''}`} />
      </StatGrid>

      <section aria-labelledby="pipeline-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="pipeline-title" className="card-title">Pipeline</h2>
          <a href="/projects/all" className="card-link">View as table</a>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map(col => {
            const list = scoped.filter(p => p.status === col)
            const value = list.reduce((s, p) => s + Number(p.contract_value || 0), 0)
            return (
              <section key={col} className="flex min-h-[240px] flex-col rounded-xl border border-line bg-surface-alt">
                <header className="flex h-11 items-center justify-between gap-2 px-3">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                    <span className={`dot ${statusDot(col)}`} />
                    {PROJECT_STATUS_LABELS[col]}
                    <span className="count">{list.length}</span>
                  </span>
                  {value > 0 && <span className="count">{fmtINR(value)}</span>}
                </header>
                <div className="flex-1 space-y-2 px-2 pb-2">
                  {loading && [0, 1].map(i => <div key={i} className="skeleton h-[78px] !rounded-lg" />)}
                  {!loading && list.length === 0 && <p className="px-2 py-8 text-center text-[12px] text-faint">No projects</p>}
                  {list.slice(0, 6).map(p => (
                    <a key={p.id} href={`/projects/${p.id}`}
                      className="block rounded-lg border border-line bg-white p-3 shadow-card transition-colors hover:border-line-strong">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-medium leading-snug text-ink">{p.name}</p>
                        {['urgent', 'high'].includes(p.priority) && <span className={p.priority === 'urgent' ? 'badge-danger' : 'badge-warning'}>{PRIORITY_LABEL[p.priority]}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-faint">{p.client_name}{p.city ? ` · ${p.city}` : ''}</p>
                      <div className="mt-2.5 flex items-center justify-between text-[12px] tabular-nums text-faint">
                        <span>{p.scheduled_date ? fmtDate(p.scheduled_date) : 'Not scheduled'}</span>
                        <span>{p.contract_value > 0 ? fmtINR(p.contract_value) : ''}</span>
                      </div>
                    </a>
                  ))}
                  {list.length > 6 && (
                    <a href={`/projects/all?status=${col}`} className="block px-2 py-1 text-[12px] font-medium text-muted hover:text-ink">{list.length - 6} more</a>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <DataTable
        title="Scheduled in the next 7 days"
        exportTitle="Installations next 7 days"
        cols={cols}
        rows={upcoming as unknown as Record<string, unknown>[]}
        loading={loading}
        rowHref={r => `/projects/${r.id}`}
        initialSort={{ key: 'scheduled_date', dir: 1 }}
        hideSearch
        toolbar={<a href="/projects/calendar" className="btn-secondary btn-sm"><CalendarClock size={14} /> Open schedule</a>}
        filtersActive={f.active}
        onClearFilters={f.clear}
        empty={{ icon: CalendarClock, title: 'No installations this week', description: 'Scheduled and in-progress projects with a date in the next 7 days appear here.' }}
      />

      {creating && (
        <ProjectFormModal
          initial={{ ...EMPTY_PROJECT, scheduled_date: today }}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load() }}
        />
      )}
    </div>
  )
}
