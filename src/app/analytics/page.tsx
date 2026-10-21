'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { BarChart3 } from 'lucide-react'
import Gate from '@/components/Gate'
import { PageHeader, Stat, StatGrid, EmptyState, PageLoading, statusDot, humanize } from '@/components/ui'
import { ChartCard, ChartEmpty, ChartTooltip, CHART_PRIMARY, AXIS_TICK, GRID_STROKE, CURSOR_FILL, BAR_MAX, BAR_RADIUS, BAR_RADIUS_H, compactINR, fullINR } from '@/components/charts'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'

type AnalyticsData = {
  monthlyQuotes: { month: string; count: number; value: number }[]
  topClients: { name: string; count: number; value: number; last: string }[]
  quoteStatus: { status: string; count: number }[]
  totalInvValue: number
  invByCategory: { cat: string; val: number }[]
  spendByCategory: { cat: string; val: number }[]
  lowStockCount: number
  projectsByStatus: Record<string, { count: number; value: number; area: number }>
  totalActiveProjects: number
  totalQuotesThisMonth: number
  totalValueThisMonth: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// API months are "MM/YYYY".
const monthLabel = (m: string) => MONTHS[Number(m.slice(0, 2)) - 1] ?? m
const monthLong = (m: string) => `${monthLabel(m)} ${m.slice(3)}`

const QUOTE_STATUS_ORDER = ['draft', 'sent', 'approved', 'rejected']

function AnalyticsInner() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />
  if (!data || !data.monthlyQuotes) {
    return <div className="card mt-8"><EmptyState icon={BarChart3} title="Analytics could not be loaded" description="Refresh the page to try again." /></div>
  }

  const months = data.monthlyQuotes.map(m => ({ ...m, label: monthLabel(m.month) }))
  const hasQuotes = months.some(m => m.count > 0)
  const statusTotal = data.quoteStatus.reduce((s, x) => s + x.count, 0)
  const statuses = [...data.quoteStatus].sort((a, b) => {
    const ia = QUOTE_STATUS_ORDER.indexOf(a.status), ib = QUOTE_STATUS_ORDER.indexOf(b.status)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const sixMonthValue = months.reduce((s, m) => s + m.value, 0)
  const pipeline = Object.entries(data.projectsByStatus)
  const invCats = data.invByCategory.filter(c => c.val > 0).sort((a, b) => b.val - a.val)
  const maxInv = Math.max(1, ...invCats.map(c => c.val))
  const spend = data.spendByCategory.slice(0, 8).map(s => ({ ...s, cat: humanize(s.cat) }))

  return (
    <div className="animate-fade-in">
      <PageHeader title="Analytics" description="Quoting, projects and inventory over the last six months." />

      <StatGrid>
        <Stat label="Quotes this month" value={data.totalQuotesThisMonth} hint={`${fmtINR(data.totalValueThisMonth)} quoted`} href="/quotes" />
        <Stat label="Active projects" value={data.totalActiveProjects} hint="Not completed or invoiced" href="/projects" />
        <Stat label="Inventory value" value={fmtINR(data.totalInvValue)} hint="Stock on hand at cost" href="/inventory" />
        <Stat label="Below minimum stock" value={data.lowStockCount} tone={data.lowStockCount > 0 ? 'warning' : 'neutral'}
          hint={data.lowStockCount > 0 ? 'Need reordering' : 'All stocked'} href="/inventory/reorder" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Quoted value by month" description={`${fmtINR(sixMonthValue)} over six months`}
          table={{ columns: ['Month', 'Quotes', 'Value'], rows: months.map(m => [monthLong(m.month), m.count, fullINR(m.value)]), alignRight: [1, 2] }}>
          {!hasQuotes ? <ChartEmpty>No quotes in the last six months.</ChartEmpty> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={compactINR} width={52} />
                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip />} />
                <Bar dataKey="value" name="Quoted value" fill={CHART_PRIMARY} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Quotes issued by month" description={`${months.reduce((s, m) => s + m.count, 0)} quotes over six months`}
          table={{ columns: ['Month', 'Quotes'], rows: months.map(m => [monthLong(m.month), m.count]), alignRight: [1] }}>
          {!hasQuotes ? <ChartEmpty>No quotes in the last six months.</ChartEmpty> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip format={v => `${v} quote${v === 1 ? '' : 's'}`} />} />
                <Bar dataKey="count" name="Quotes" fill={CHART_PRIMARY} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Quotes by status</h2><span className="text-xs text-gray-500 tabular-nums">{statusTotal} total</span></div>
          {statuses.length === 0 ? <EmptyState icon={BarChart3} title="No quotes yet" compact /> : (
            <ul className="space-y-3.5 p-5">
              {statuses.map(s => {
                const pct = statusTotal ? (s.count / statusTotal) * 100 : 0
                return (
                  <li key={s.status}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="flex items-center gap-2 text-gray-800"><span className={`dot ${statusDot(s.status)}`} />{humanize(s.status)}</span>
                      <span className="tabular-nums text-gray-500"><span className="font-medium text-gray-900">{s.count}</span> · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-100"><div className={`h-1.5 rounded-full ${statusDot(s.status)}`} style={{ width: `${pct}%` }} /></div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="table-wrap">
          <div className="card-header"><h2 className="card-title">Project pipeline</h2><a href="/projects" className="card-link">Projects</a></div>
          {pipeline.length === 0 ? <EmptyState icon={BarChart3} title="No projects yet" compact /> : (
            <table className="table">
              <thead><tr><th>Stage</th><th className="num">Projects</th><th className="num">Area</th><th className="num">Value</th></tr></thead>
              <tbody>
                {pipeline.map(([status, d]) => (
                  <tr key={status}>
                    <td><span className="flex items-center gap-2"><span className={`dot ${statusDot(status)}`} />{PROJECT_STATUS_LABELS[status] ?? humanize(status)}</span></td>
                    <td className="num">{d.count}</td>
                    <td className="num">{d.area.toLocaleString('en-IN')} sqft</td>
                    <td className="num font-medium text-gray-900">{fmtINR(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="table-wrap mt-4">
        <div className="card-header"><h2 className="card-title">Top clients by quoted value</h2><a href="/clients" className="card-link">Clients</a></div>
        {data.topClients.length === 0 ? <EmptyState icon={BarChart3} title="No clients yet" compact /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th className="w-10">#</th><th>Client</th><th className="num">Quotes</th><th className="num hidden sm:table-cell">Last quote</th><th className="num">Quoted value</th></tr></thead>
              <tbody>
                {data.topClients.map((c, i) => (
                  <tr key={c.name}>
                    <td className="text-xs text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="font-medium text-gray-900">{c.name}</td>
                    <td className="num">{c.count}</td>
                    <td className="num hidden sm:table-cell text-gray-500">{fmtDate(c.last)}</td>
                    <td className="num font-medium text-gray-900">{fmtINR(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Inventory value by category</h2><span className="text-xs text-gray-500 tabular-nums">{fmtINR(data.totalInvValue)}</span></div>
          {invCats.length === 0 ? <EmptyState icon={BarChart3} title="No inventory data" compact /> : (
            <ul className="space-y-3.5 p-5">
              {invCats.map(c => (
                <li key={c.cat}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-gray-800">{humanize(c.cat)}</span>
                    <span className="font-medium tabular-nums text-gray-900">{fmtINR(c.val)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full" style={{ width: `${(c.val / maxInv) * 100}%`, background: CHART_PRIMARY }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ChartCard title="Purchase spend by category" description="All purchase order lines"
          table={{ columns: ['Category', 'Spend'], rows: spend.map(s => [s.cat, fullINR(s.val)]), alignRight: [1] }}>
          {spend.length === 0 ? <ChartEmpty>No purchase data yet.</ChartEmpty> : (
            <ResponsiveContainer width="100%" height={Math.max(160, spend.length * 40)}>
              <BarChart data={spend} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={compactINR} />
                <YAxis type="category" dataKey="cat" tick={AXIS_TICK} axisLine={false} tickLine={false} width={110} />
                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip />} />
                <Bar dataKey="val" name="Spend" fill={CHART_PRIMARY} radius={BAR_RADIUS_H} maxBarSize={BAR_MAX} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  return <Gate module="analytics"><AnalyticsInner /></Gate>
}
