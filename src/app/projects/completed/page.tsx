'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { PageHeader, Stat, StatGrid } from '@/components/ui'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR } from '@/lib/format'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, PeriodFilter, resolvePeriod, inPeriod, optionsFrom } from '@/components/filters'

type Project = { id: string; name: string; client_name: string; city: string; status: string; completion_date: string; ceiling_area_sqft: number; contract_value: number; team_lead: string }

export default function CompletedProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const f = useFilters({ period: 'all', from: '', to: '', status: '', city: '', lead: '' })
  const v = f.values

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/projects?status=completed').then(r => (r.ok ? r.json() : Promise.reject(new Error(`The server returned ${r.status}.`)))),
      fetch('/api/projects?status=invoiced').then(r => (r.ok ? r.json() : Promise.reject(new Error(`The server returned ${r.status}.`)))),
    ]).then(([d, inv]) => {
      setProjects([...(Array.isArray(d) ? d : []), ...(Array.isArray(inv) ? inv : [])])
      setLoadError('')
      setLoading(false)
    }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const period = resolvePeriod(v.period, v.from, v.to)
  const rows = useMemo(() => projects.filter(p =>
    inPeriod(p.completion_date, period) && (!v.status || p.status === v.status) && (!v.city || p.city === v.city) && (!v.lead || p.team_lead === v.lead)),
  [projects, period.from, period.to, v.status, v.city, v.lead]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalArea = rows.reduce((s, p) => s + Number(p.ceiling_area_sqft || 0), 0)
  const totalValue = rows.reduce((s, p) => s + Number(p.contract_value || 0), 0)

  const cols: Col[] = [
    { key: 'completion_date', label: 'Completed', kind: 'date' },
    { key: 'name', label: 'Project', sub: { key: 'client_name', label: 'Client' }, render: r => <a href={`/projects/${r.id}`}>{String(r.name)}</a> },
    { key: 'city', label: 'City', hideBelow: 'md' },
    { key: 'team_lead', label: 'Team lead', hideBelow: 'lg' },
    { key: 'status', label: 'Status', kind: 'status', labels: PROJECT_STATUS_LABELS, hideBelow: 'sm' },
    { key: 'ceiling_area_sqft', label: 'Area (sqft)', kind: 'int', total: true, hideBelow: 'sm' },
    { key: 'contract_value', label: 'Value', kind: 'money', total: true },
  ]

  return (
    <div className="page">
      <PageHeader title="Completed projects" description="Finished and invoiced installations." />

      <div className="no-print flex flex-wrap items-center gap-2">
        <PeriodFilter period={v.period} from={v.from} to={v.to} dateLabel="Completed" onChange={x => f.set(x)} />
      </div>

      <StatGrid cols={4}>
        <Stat label="Projects" value={loading ? null : rows.length} hint={loading ? undefined : period.label} />
        <Stat label="Area installed" value={loading ? null : totalArea.toLocaleString('en-IN')} unit="sqft" hint={loading ? undefined : 'Ceiling area across these projects'} />
        <Stat label="Contract value" value={loading ? null : fmtINR(totalValue)} hint={loading ? undefined : `${rows.filter(p => p.status === 'invoiced').length} invoiced`} />
        <Stat label="Average per project" value={loading ? null : rows.length ? fmtINR(Math.round(totalValue / rows.length)) : '—'} hint={loading ? undefined : rows.length && totalArea ? `₹${Math.round(totalValue / totalArea).toLocaleString('en-IN')} per sqft` : ' '} />
      </StatGrid>

      <DataTable
        title="Completed and invoiced"
        exportTitle="Completed projects"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/projects/${r.id}`}
        initialSort={{ key: 'completion_date', dir: -1 }}
        searchPlaceholder="Search project, client, city"
        filters={<>
          <FilterSelect value={v.status} onChange={x => f.set({ status: x })} all="Completed or invoiced" className="w-full sm:w-48"
            options={[{ value: 'completed', label: 'Completed, not invoiced' }, { value: 'invoiced', label: 'Invoiced' }]} />
          <FilterSelect value={v.city} onChange={x => f.set({ city: x })} all="All cities" options={optionsFrom(projects, p => p.city)} />
          <FilterSelect value={v.lead} onChange={x => f.set({ lead: x })} all="All team leads" className="w-full sm:w-48" options={optionsFrom(projects, p => p.team_lead)} />
        </>}
        filtersActive={!!(v.status || v.city || v.lead || v.period !== 'all' || v.from || v.to)}
        onClearFilters={f.clear}
        note={[period.key !== 'all' && `${period.label} ${period.from} to ${period.to}`, v.status && PROJECT_STATUS_LABELS[v.status], v.city, v.lead].filter(Boolean).join(' · ') || undefined}
        empty={{ icon: CheckCircle2, title: 'No completed projects yet', description: 'Projects marked completed or invoiced appear here.' }}
      />
    </div>
  )
}
