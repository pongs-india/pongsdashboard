'use client'
import { useState, useEffect } from 'react'
import { Wallet } from 'lucide-react'
import Gate from '@/components/Gate'
import { PageHeader, Stat, StatGrid, EmptyState, LoadingRows, StatusBadge, SearchInput } from '@/components/ui'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR } from '@/lib/format'
import { navigate } from '@/lib/navigate'

interface ProjectFinance {
  id: string; name: string; client_name: string; status: string
  contract_value: number; total_paid: number; total_expenses: number; created_at: string
}

type Filter = 'all' | 'outstanding' | 'paid'

function FinanceInner() {
  const [projects, setProjects] = useState<ProjectFinance[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/finance').then(r => r.json()).then(data => { setProjects(Array.isArray(data) ? data : []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const contract = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0)
  const received = projects.reduce((s, p) => s + Number(p.total_paid || 0), 0)
  const expenses = projects.reduce((s, p) => s + Number(p.total_expenses || 0), 0)
  const outstanding = contract - received
  // Same definition as the project page: contract value less expenses.
  const grossProfit = contract - expenses
  const cash = received - expenses

  const owing = (p: ProjectFinance) => Number(p.contract_value || 0) - Number(p.total_paid || 0)
  const q = search.toLowerCase()
  const filtered = projects
    .filter(p => filter === 'all' || (filter === 'outstanding' ? owing(p) > 0 : owing(p) <= 0))
    .filter(p => !q || p.name?.toLowerCase().includes(q) || p.client_name?.toLowerCase().includes(q))
    .sort((a, b) => owing(b) - owing(a))

  return (
    <div className="animate-fade-in">
      <PageHeader title="Finance" description="Collections, expenses and profit across every project." />

      <StatGrid cols={5}>
        <Stat label="Contract value" value={loading ? '—' : fmtINR(contract)} hint={`${projects.length} projects`} />
        <Stat label="Received" value={loading ? '—' : fmtINR(received)} hint={contract ? `${Math.round((received / contract) * 100)}% collected` : ' '} tone="success" />
        <Stat label="Outstanding" value={loading ? '—' : fmtINR(outstanding)} hint="Due from clients" tone={outstanding > 0 ? 'warning' : 'neutral'} />
        <Stat label="Expenses" value={loading ? '—' : fmtINR(expenses)} hint="Recorded against projects" />
        <Stat label="Gross profit" value={loading ? '—' : fmtINR(grossProfit)}
          hint={`Cash position ${fmtINR(cash)}`} tone={grossProfit >= 0 ? 'success' : 'danger'} />
      </StatGrid>

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="segmented">
            <button data-active={filter === 'all'} onClick={() => setFilter('all')}>All projects</button>
            <button data-active={filter === 'outstanding'} onClick={() => setFilter('outstanding')}>With balance due</button>
            <button data-active={filter === 'paid'} onClick={() => setFilter('paid')}>Fully paid</button>
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search project or client" />
        </div>

        {loading ? <LoadingRows rows={5} cols={6} /> : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title={projects.length ? 'No projects match' : 'No projects yet'} description={projects.length ? undefined : 'Project payments and expenses roll up here.'} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="hidden md:table-cell">Status</th>
                  <th className="num">Contract</th>
                  <th className="w-[18%] hidden lg:table-cell">Collected</th>
                  <th className="num">Outstanding</th>
                  <th className="num hidden lg:table-cell">Expenses</th>
                  <th className="num">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cv = Number(p.contract_value || 0)
                  const paid = Number(p.total_paid || 0)
                  const exp = Number(p.total_expenses || 0)
                  const profit = cv - exp
                  const pct = cv > 0 ? (profit / cv) * 100 : 0
                  const collected = cv > 0 ? Math.min(100, (paid / cv) * 100) : 0
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/projects/${p.id}`, e)}>
                      <td>
                        <a href={`/projects/${p.id}`} className="font-medium text-gray-900 hover:underline">{p.name}</a>
                        <div className="text-xs text-gray-500">{p.client_name}</div>
                      </td>
                      <td className="hidden md:table-cell"><StatusBadge status={p.status} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                      <td className="num">{fmtINR(cv)}</td>
                      <td className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${collected}%` }} /></div>
                          <span className="w-9 text-right text-xs tabular-nums text-gray-500">{Math.round(collected)}%</span>
                        </div>
                      </td>
                      <td className={`num font-medium ${cv - paid > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{cv - paid > 0 ? fmtINR(cv - paid) : 'Paid'}</td>
                      <td className="num hidden lg:table-cell">{fmtINR(exp)}</td>
                      <td className="num whitespace-nowrap">
                        <span className={`font-medium ${profit >= 0 ? 'text-gray-900' : 'text-red-700'}`}>{fmtINR(profit)}</span>
                        <span className="ml-1.5 text-xs text-gray-500">{pct.toFixed(0)}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="table-footer">
            <span>{filtered.length} of {projects.length} projects</span>
            <span className="tabular-nums">Outstanding {fmtINR(filtered.reduce((s, p) => s + Math.max(0, owing(p)), 0))}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FinancePage() {
  return <Gate module="finance"><FinanceInner /></Gate>
}
