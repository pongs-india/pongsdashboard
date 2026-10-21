'use client'
import { useCallback, useEffect, useState } from 'react'
import { Plus, CalendarClock } from 'lucide-react'
import { PageHeader, Stat, StatGrid, EmptyState, statusDot } from '@/components/ui'
import ProjectFormModal, { EMPTY_PROJECT, PROJECT_STATUS_LABELS, type Project } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'
import { navigate } from '@/lib/navigate'

const PIPELINE = ['scheduled', 'in_progress', 'completed', 'invoiced'] as const
const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High' }

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const thisMonth = new Date().toISOString().slice(0, 7)

  const active = projects.filter(p => !['completed', 'invoiced', 'cancelled'].includes(p.status))
  const thisWeek = projects.filter(p => p.scheduled_date >= today && p.scheduled_date <= nextWeek)
  const completedMonth = projects.filter(p => p.status === 'completed' && p.completion_date?.startsWith(thisMonth))
  const invoiced = projects.filter(p => p.status === 'invoiced')
  // Open jobs (scheduled or in progress) with an install date in the next 7 days.
  const upcoming = thisWeek
    .filter(p => ['scheduled', 'in_progress'].includes(p.status))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Projects"
        description="Installation pipeline from scheduling to invoicing."
        actions={<button onClick={() => setCreating(true)} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New project</button>}
      />

      <StatGrid>
        <Stat label="Active projects" value={loading ? '—' : active.length}
          hint={loading ? ' ' : `${fmtINR(active.reduce((s, p) => s + Number(p.contract_value || 0), 0))} contracted`} />
        <Stat label="Installs next 7 days" value={loading ? '—' : upcoming.length}
          hint={upcoming[0] ? `Next: ${upcoming[0].name}` : 'Nothing scheduled'} href="/projects/calendar" />
        <Stat label="Completed this month" value={loading ? '—' : completedMonth.length} hint="By completion date" href="/projects/completed" />
        <Stat label="Invoiced value" value={loading ? '—' : fmtINR(invoiced.reduce((s, p) => s + Number(p.contract_value || 0), 0))}
          hint={`${invoiced.length} project${invoiced.length !== 1 ? 's' : ''}`} />
      </StatGrid>

      <div className="mb-3 flex items-end justify-between">
        <h2 className="section-title">Pipeline</h2>
        <a href="/projects/all" className="card-link">View as table</a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {PIPELINE.map(col => {
          const list = projects.filter(p => p.status === col)
          const value = list.reduce((s, p) => s + Number(p.contract_value || 0), 0)
          return (
            <section key={col} className="flex min-h-[220px] flex-col rounded-lg border border-gray-200 bg-gray-100/60">
              <header className="flex items-center justify-between gap-2 px-3 h-11">
                <span className="flex items-center gap-2 text-[13px] font-medium text-gray-800">
                  <span className={`dot ${statusDot(col)}`} />
                  {PROJECT_STATUS_LABELS[col]}
                  <span className="text-xs font-normal text-gray-500 tabular-nums">{list.length}</span>
                </span>
                {value > 0 && <span className="text-xs text-gray-500 tabular-nums">{fmtINR(value)}</span>}
              </header>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {loading && [0, 1].map(i => <div key={i} className="skeleton h-[74px] rounded-md" />)}
                {!loading && list.length === 0 && <p className="px-2 py-6 text-center text-xs text-gray-400">No projects</p>}
                {list.slice(0, 6).map(p => (
                  <a key={p.id} href={`/projects/${p.id}`}
                    className="block rounded-md border border-gray-200 bg-white p-3 shadow-sm hover:border-gray-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium leading-snug text-gray-900">{p.name}</p>
                      {PRIORITY_LABEL[p.priority] && <span className={p.priority === 'urgent' ? 'badge-danger' : 'badge-warning'}>{PRIORITY_LABEL[p.priority]}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{p.client_name}{p.city ? ` · ${p.city}` : ''}</p>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-gray-500 tabular-nums">
                      <span>{p.scheduled_date ? fmtDate(p.scheduled_date) : 'Not scheduled'}</span>
                      <span>{p.ceiling_area_sqft > 0 ? `${p.ceiling_area_sqft} sqft` : ''}</span>
                    </div>
                  </a>
                ))}
                {list.length > 6 && (
                  <a href="/projects/all" className="block px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900">{list.length - 6} more</a>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <section className="table-wrap mt-6">
        <div className="card-header">
          <h2 className="card-title">Scheduled in the next 7 days</h2>
          <a href="/projects/calendar" className="card-link">Open schedule</a>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No installations this week" compact />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead><tr><th>Date</th><th>Project</th><th className="hidden sm:table-cell">City</th><th>Team lead</th><th className="num">Value</th></tr></thead>
              <tbody>
                {upcoming.map(p => (
                  <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/projects/${p.id}`, e)}>
                    <td className="whitespace-nowrap tabular-nums text-gray-900">{fmtDate(p.scheduled_date)}</td>
                    <td><div className="font-medium text-gray-900">{p.name}</div><div className="text-xs text-gray-500">{p.client_name}</div></td>
                    <td className="hidden sm:table-cell">{p.city || '—'}</td>
                    <td>{p.team_lead || <span className="text-gray-400">Unassigned</span>}</td>
                    <td className="num">{p.contract_value > 0 ? fmtINR(p.contract_value) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
