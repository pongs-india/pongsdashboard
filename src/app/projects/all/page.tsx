'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, HardHat, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, EmptyState, LoadingRows, SearchInput, StatusBadge, Badge } from '@/components/ui'
import ProjectFormModal, { EMPTY_PROJECT, PROJECT_STATUSES, PROJECT_STATUS_LABELS, type Project } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'
import { confirmDialog, toast } from '@/components/feedback'
import { useNewParam } from '@/lib/useNewParam'
import { useSort, SortHeader, usePagination, Pagination, downloadCsv, ExportButton, useUrlState } from '@/components/table'
import { navigate } from '@/lib/navigate'

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' }

export default function AllProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useUrlState('q', '')
  const [filterStatus, setFilterStatus] = useUrlState('status', 'all')
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<Project | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/projects')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])
  useNewParam(() => setEditing({ ...EMPTY_PROJECT, scheduled_date: new Date().toISOString().slice(0, 10) }))

  const filtered = projects.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })
  const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  const { sorted, sort, toggle } = useSort(filtered, {
    name: p => p.name,
    city: p => p.city,
    status: p => PROJECT_STATUSES.indexOf(p.status),
    scheduled: p => p.scheduled_date,
    lead: p => p.team_lead,
    priority: p => PRIORITY_RANK[p.priority] ?? 9,
    area: p => Number(p.ceiling_area_sqft || 0),
    value: p => Number(p.contract_value || 0),
  }, { key: 'scheduled', dir: 'desc' })
  const pager = usePagination(sorted, 25)
  const exportCsv = () => downloadCsv('pongs-projects',
    ['Project', 'Client', 'City', 'Site address', 'Status', 'Scheduled', 'Completed', 'Team lead', 'Priority', 'Area (sqft)', 'Contract value (INR)'],
    sorted.map(p => [p.name, p.client_name, p.city, p.site_address, PROJECT_STATUS_LABELS[p.status] ?? p.status, p.scheduled_date, p.completion_date, p.team_lead, p.priority, Number(p.ceiling_area_sqft || 0), Math.round(Number(p.contract_value || 0))]))
  const counts = Object.fromEntries(PROJECT_STATUSES.map(s => [s, projects.filter(p => p.status === s).length]))

  async function del(p: Project) {
    const ok = await confirmDialog({ title: 'Delete project', body: `"${p.name}" and its payments, expenses and checklist will be permanently removed.`, confirmLabel: 'Delete project', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    if (res.ok) toast('Project deleted'); else toast('Could not delete the project', { tone: 'error' })
    load()
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="All projects"
        description="Every installation project, current and past."
        actions={<>
          <ExportButton onClick={exportCsv} disabled={loading || sorted.length === 0} />
          <button onClick={() => setEditing({ ...EMPTY_PROJECT, scheduled_date: new Date().toISOString().slice(0, 10) })} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New project</button>
        </>}
      />

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button type="button" className="chip" aria-pressed={filterStatus === 'all'} data-active={filterStatus === 'all'} onClick={() => setFilterStatus('all')}>All <span className="tabular-nums opacity-60">{projects.length}</span></button>
            {PROJECT_STATUSES.map(s => (
              <button key={s} type="button" className="chip" aria-pressed={filterStatus === s} data-active={filterStatus === s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}>
                {PROJECT_STATUS_LABELS[s]} <span className="tabular-nums opacity-60">{counts[s]}</span>
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search project, client, city" />
        </div>

        {loading ? <LoadingRows rows={6} cols={6} /> : loadError ? (
          <div className="p-5"><div className="alert-error" role="alert"><span><span className="font-medium">Projects could not be loaded.</span> {loadError} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={HardHat}
            title={projects.length === 0 ? 'No projects yet' : 'No projects match these filters'}
            description={projects.length === 0 ? 'Create a project, or convert an approved quote into one.' : 'Try another status or search term.'}
            action={projects.length === 0 ? <button onClick={() => setEditing({ ...EMPTY_PROJECT })} className="btn-primary"><Plus size={15} /> New project</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <SortHeader label="Project" sortKey="name" sort={sort} onSort={toggle} />
                  <SortHeader label="City" sortKey="city" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                  <SortHeader label="Scheduled" sortKey="scheduled" sort={sort} onSort={toggle} className="hidden lg:table-cell" />
                  <SortHeader label="Team lead" sortKey="lead" sort={sort} onSort={toggle} className="hidden lg:table-cell" />
                  <SortHeader label="Priority" sortKey="priority" sort={sort} onSort={toggle} className="hidden xl:table-cell" />
                  <SortHeader label="Area" sortKey="area" sort={sort} onSort={toggle} align="right" className="hidden sm:table-cell" />
                  <SortHeader label="Value" sortKey="value" sort={sort} onSort={toggle} align="right" />
                  <th className="w-20"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map(p => (
                  <tr key={p.id} className="group cursor-pointer" onClick={e => {
                    if ((e.target as HTMLElement).closest('button,a')) return
                    navigate(`/projects/${p.id}`, e)
                  }}>
                    <td className="max-w-[260px]">
                      <a href={`/projects/${p.id}`} className="block truncate font-medium text-gray-900 hover:underline">{p.name}</a>
                      <div className="truncate text-xs text-gray-500">{p.client_name}</div>
                    </td>
                    <td className="hidden md:table-cell">{p.city || '—'}</td>
                    <td><StatusBadge status={p.status} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                    <td className="hidden lg:table-cell whitespace-nowrap tabular-nums">{p.scheduled_date ? fmtDate(p.scheduled_date) : '—'}</td>
                    <td className="hidden lg:table-cell">{p.team_lead || <span className="text-gray-500">Unassigned</span>}</td>
                    <td className="hidden xl:table-cell"><Badge tone={PRIORITY_TONE[p.priority] ?? 'neutral'}>{p.priority ? p.priority.charAt(0).toUpperCase() + p.priority.slice(1) : '—'}</Badge></td>
                    <td className="num hidden sm:table-cell">{p.ceiling_area_sqft > 0 ? `${p.ceiling_area_sqft} sqft` : '—'}</td>
                    <td className="num font-medium text-gray-900">{p.contract_value > 0 ? fmtINR(p.contract_value) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => setEditing(p)} className="btn-ghost btn-icon" aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
                      <button onClick={() => del(p)} className="btn-ghost btn-icon text-gray-500 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && filtered.length > 0 && (
          <Pagination {...pager} noun="projects" summary={`${fmtINR(filtered.reduce((s, p) => s + Number(p.contract_value || 0), 0))} contracted`} />
        )}
      </div>

      {editing && (
        <ProjectFormModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}
