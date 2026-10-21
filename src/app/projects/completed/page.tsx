'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { PageHeader, Stat, StatGrid, EmptyState, LoadingRows, StatusBadge } from '@/components/ui'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate, fmtMonth } from '@/lib/format'
import { Select } from '@/components/controls'
import { navigate } from '@/lib/navigate'

type Project = { id: string; name: string; client_name: string; city: string; status: string; completion_date: string; ceiling_area_sqft: number; contract_value: number; team_lead: string }

export default function CompletedProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/projects?status=completed').then(r => r.json()),
      fetch('/api/projects?status=invoiced').then(r => r.json()),
    ]).then(([d, inv]) => {
      const all = [...(Array.isArray(d) ? d : []), ...(Array.isArray(inv) ? inv : [])]
      setProjects(all.sort((a: Project, b: Project) => (b.completion_date || '').localeCompare(a.completion_date || '')))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const months = Array.from(new Set(projects.map(p => p.completion_date?.slice(0, 7)).filter(Boolean))).sort().reverse()
  const filtered = filterMonth ? projects.filter(p => p.completion_date?.startsWith(filterMonth)) : projects
  const totalArea = filtered.reduce((s, p) => s + Number(p.ceiling_area_sqft || 0), 0)
  const totalValue = filtered.reduce((s, p) => s + Number(p.contract_value || 0), 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Completed projects"
        description="Finished and invoiced installations."
        actions={
          <Select className="w-48" value={filterMonth} onChange={setFilterMonth} ariaLabel="Completion month"
            options={[{ value: '', label: 'All time' }, ...months.map(m => ({ value: m as string, label: fmtMonth(m + '-01') }))]} />
        }
      />

      <StatGrid>
        <Stat label="Projects" value={loading ? '—' : filtered.length} hint={`${filtered.filter(p => p.status === 'invoiced').length} invoiced`} />
        <Stat label="Area installed" value={loading ? '—' : `${totalArea.toLocaleString('en-IN')} sqft`} />
        <Stat label="Contract value" value={loading ? '—' : fmtINR(totalValue)} />
        <Stat label="Average per project" value={loading ? '—' : filtered.length ? fmtINR(Math.round(totalValue / filtered.length)) : null} />
      </StatGrid>

      <div className="table-wrap">
        {loading ? <LoadingRows rows={5} cols={5} /> : filtered.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No completed projects" description={filterMonth ? 'Nothing was completed in this month.' : 'Completed and invoiced projects appear here.'} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="hidden md:table-cell">City</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th className="hidden lg:table-cell">Team lead</th>
                  <th className="num hidden sm:table-cell">Area</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/projects/${p.id}`, e)}>
                    <td><div className="font-medium text-gray-900">{p.name}</div><div className="text-xs text-gray-500">{p.client_name}</div></td>
                    <td className="hidden md:table-cell">{p.city || '—'}</td>
                    <td><StatusBadge status={p.status} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(p.completion_date)}</td>
                    <td className="hidden lg:table-cell">{p.team_lead || '—'}</td>
                    <td className="num hidden sm:table-cell">{p.ceiling_area_sqft ? `${p.ceiling_area_sqft} sqft` : '—'}</td>
                    <td className="num font-medium text-gray-900">{p.contract_value > 0 ? fmtINR(p.contract_value) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
