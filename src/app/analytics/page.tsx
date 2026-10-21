'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Gate from '@/components/Gate'
import { PageHeader, Stat, StatGrid, PageLoading } from '@/components/ui'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR } from '@/lib/format'
import { calculateQuote } from '@/lib/calculations'
import type { Quote } from '@/lib/types'
import { listCompanies } from '@/lib/companies'
import { DataTable, type Col } from '@/components/DataTable'
import { ChartCard, PairBars, Split, HBars, compactINR, lastMonths } from '@/components/miniCharts'
import { useFilters, FilterSelect, PeriodFilter, resolvePeriod, inPeriod } from '@/components/filters'
import { useMe } from '@/lib/useMe'

type Row = Record<string, unknown>
const TIER_LABEL: Record<string, string> = { dealer: 'Dealer', msp: 'MSP', specifiors: 'Specifier', manual: 'Manual', manual_custom: 'Custom' }
const STATUS_FILL: Record<string, string> = { draft: 'bg-line-hover', sent: 'bg-info-fill', approved: 'bg-success-fill', rejected: 'bg-danger-fill' }
const totalOf = (q: Quote) => { try { return calculateQuote(q).grandTotal } catch { return 0 } }
const statusOf = (q: Quote) => String((q as unknown as Row).status ?? 'draft')

function AnalyticsInner() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [projects, setProjects] = useState<Row[]>([])
  const [products, setProducts] = useState<Row[]>([])
  const [purchases, setPurchases] = useState<Row[]>([])
  const [error, setError] = useState('')
  const { me } = useMe()
  const f = useFilters({ period: 'fy', from: '', to: '', company: '' })
  const v = f.values

  const load = useCallback(() => {
    const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : [])).catch(() => [])
    Promise.all([
      fetch('/api/quotes').then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d }),
      get('/api/projects'), get('/api/inventory/products'), get('/api/inventory/purchases'),
    ]).then(([q, p, pr, pu]) => {
      setQuotes(Array.isArray(q) ? q : []); setProjects(Array.isArray(p) ? p : []); setProducts(Array.isArray(pr) ? pr : []); setPurchases(Array.isArray(pu) ? pu : [])
      setError('')
    }).catch(e => setError(e instanceof Error ? e.message : 'Could not reach the server.'))
  }, [])
  useEffect(() => { load() }, [load])

  const period = resolvePeriod(v.period, v.from, v.to)
  const scoped = useMemo(() => (quotes ?? []).filter(q => !v.company || (q.company ?? 'STC') === v.company), [quotes, v.company])
  const inRange = useMemo(() => scoped.filter(q => inPeriod(q.date, period)).map(q => ({ q, total: totalOf(q), status: statusOf(q) })),
    [scoped, period.from, period.to]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !quotes) {
    return (
      <div className="page">
        <PageHeader title="Analytics" description="Quoting, projects and inventory." />
        <div className="alert-error" role="alert"><span><span className="font-medium">Analytics could not be loaded.</span> {error} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div>
      </div>
    )
  }
  if (!quotes) return <PageLoading />

  const quoted = inRange.reduce((s, x) => s + x.total, 0)
  const won = inRange.filter(x => x.status === 'approved')
  const decided = inRange.filter(x => ['approved', 'rejected'].includes(x.status)).length
  const companies = listCompanies()
  const companyName = v.company ? companies.find(c => c.id === v.company)?.shortName : ''

  const monthly = lastMonths(12).map(m => {
    const list = scoped.filter(q => String(q.date ?? '').startsWith(m.key))
    return { label: m.label, a: list.reduce((s, q) => s + totalOf(q), 0), b: list.filter(q => statusOf(q) === 'approved').reduce((s, q) => s + totalOf(q), 0) }
  })
  const byStatus = ['draft', 'sent', 'approved', 'rejected'].map(s => ({ label: s.charAt(0).toUpperCase() + s.slice(1), color: STATUS_FILL[s], value: inRange.filter(x => x.status === s).length }))
  const byTier = Object.entries(inRange.reduce<Record<string, number>>((m, x) => { const t = TIER_LABEL[x.q.priceTier] ?? x.q.priceTier; m[t] = (m[t] ?? 0) + x.total; return m }, {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  const clientMap: Record<string, { client: string; quotes: number; quoted: number; won: number; last: string }> = {}
  for (const x of inRange) {
    const k = x.q.clientName || 'Unknown'
    const c = (clientMap[k] ??= { client: k, quotes: 0, quoted: 0, won: 0, last: '' })
    c.quotes++; c.quoted += x.total; if (x.status === 'approved') c.won += x.total
    if (String(x.q.date) > c.last) c.last = String(x.q.date)
  }
  const clients = Object.values(clientMap)

  const people: Record<string, { person: string; quotes: number; quoted: number; won: number; decided: number; approved: number }> = {}
  for (const x of inRange) {
    const k = x.q.ownerEmail || 'Unassigned'
    const p = (people[k] ??= { person: k, quotes: 0, quoted: 0, won: 0, decided: 0, approved: 0 })
    p.quotes++; p.quoted += x.total
    if (x.status === 'approved') { p.won += x.total; p.approved++ }
    if (['approved', 'rejected'].includes(x.status)) p.decided++
  }
  const salespeople = Object.values(people).map(p => ({ ...p, rate: p.decided ? (p.approved / p.decided) * 100 : null }))

  const pipeline = PROJECT_STATUSES.map(s => {
    const list = projects.filter(p => p.status === s)
    return { status: s, label: PROJECT_STATUS_LABELS[s], count: list.length, area: list.reduce((t, p) => t + Number(p.ceiling_area_sqft || 0), 0), value: list.reduce((t, p) => t + Number(p.contract_value || 0), 0) }
  }).filter(p => p.count > 0)
  const active = projects.filter(p => !['completed', 'invoiced', 'cancelled'].includes(String(p.status)))

  const invByCat = Object.entries(products.reduce<Record<string, number>>((m, p) => { const c = String(p.category || 'Uncategorised'); m[c] = (m[c] ?? 0) + Number(p.current_stock || 0) * Number(p.cost_price || 0); return m }, {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  const spendByCat = Object.entries(purchases.filter(p => inPeriod(p.purchase_date, period)).flatMap(p => (p.items as Row[] | undefined) ?? [])
    .reduce<Record<string, number>>((m, i) => { const c = String(i.category || 'Other'); m[c] = (m[c] ?? 0) + Number(i.total_price || 0); return m }, {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  const clientCols: Col[] = [
    { key: 'client', label: 'Client', render: r => <span className="font-medium">{String(r.client)}</span> },
    { key: 'quotes', label: 'Quotes', kind: 'int', total: true },
    { key: 'last', label: 'Last quote', kind: 'date', hideBelow: 'md' },
    { key: 'won', label: 'Won', kind: 'money', total: true, hideBelow: 'sm' },
    { key: 'quoted', label: 'Quoted value', kind: 'money', total: true },
  ]
  const peopleCols: Col[] = [
    { key: 'person', label: 'Salesperson', render: r => <span className="font-medium">{String(r.person)}</span> },
    { key: 'quotes', label: 'Quotes', kind: 'int', total: true },
    { key: 'rate', label: 'Win rate', kind: 'percent', hideBelow: 'sm' },
    { key: 'won', label: 'Won', kind: 'money', total: true },
    { key: 'quoted', label: 'Quoted', kind: 'money', total: true },
  ]
  const pipelineCols: Col[] = [
    { key: 'label', label: 'Stage', sortValue: r => PROJECT_STATUSES.indexOf(String(r.status)) },
    { key: 'count', label: 'Projects', kind: 'int', total: true },
    { key: 'area', label: 'Area (sqft)', kind: 'int', total: true, hideBelow: 'sm' },
    { key: 'value', label: 'Value', kind: 'money', total: true },
  ]
  const scope = [period.key === 'custom' ? `${period.from} to ${period.to}` : period.label, companyName].filter(Boolean).join(' · ')

  return (
    <div className="page">
      <PageHeader title="Analytics" description="Quoting performance, the project pipeline and inventory, for the period and company you pick." />

      <div className="no-print flex flex-wrap items-center gap-2">
        <PeriodFilter period={v.period} from={v.from} to={v.to} dateLabel="Quote date" onChange={x => f.set(x)} />
        <FilterSelect value={v.company} onChange={x => f.set({ company: x })} all="All companies" className="w-full sm:w-40" options={companies.map(c => ({ value: c.id, label: c.shortName }))} />
        {f.active && <button type="button" className="btn-ghost btn-sm" onClick={f.clear}>Reset</button>}
      </div>

      <StatGrid cols={5}>
        <Stat label="Quoted" value={fmtINR(quoted)} hint={`${inRange.length} quotes`} />
        <Stat label="Won" value={fmtINR(won.reduce((s, x) => s + x.total, 0))} hint={`${won.length} approved`} tone={won.length ? 'success' : 'neutral'} />
        <Stat label="Win rate" value={decided ? `${Math.round((won.length / decided) * 100)}%` : '—'} hint={decided ? `${decided} decided quotes` : 'No decisions yet'} />
        <Stat label="Average quote" value={inRange.length ? fmtINR(Math.round(quoted / inRange.length)) : '—'} hint="Quoted value per quote" />
        <Stat label="Active projects" value={active.length} hint={`${fmtINR(active.reduce((s, p) => s + Number(p.contract_value || 0), 0))} contracted`} href="/projects/all" />
      </StatGrid>

      <div className="grid-equal lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Quoted and won per month" subtitle={`Last 12 months${companyName ? `, ${companyName}` : ''}`}><PairBars data={monthly} names={['Quoted', 'Won']} /></ChartCard>
        </div>
        <div>
          <ChartCard title="Quotes by status" subtitle={scope}><Split parts={byStatus} /></ChartCard>
        </div>
      </div>

      <div className="grid-equal lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable title="Top clients" exportTitle={`Top clients, ${scope}`} cols={clientCols} rows={clients as unknown as Row[]} rowKey="client"
            initialSort={{ key: 'quoted', dir: -1 }} pageSize={10} searchPlaceholder="Search client"
            empty={{ title: 'No quotes in this period', description: 'Pick a longer period to see clients.' }} />
        </div>
        <div>
          <ChartCard title="Value by price list" subtitle={scope}><HBars data={byTier} format={compactINR} /></ChartCard>
        </div>
      </div>

      {me?.isAdmin && (
        <DataTable title="Salespeople" exportTitle={`Salespeople, ${scope}`} cols={peopleCols} rows={salespeople as unknown as Row[]} rowKey="person"
          initialSort={{ key: 'quoted', dir: -1 }} hideSearch
          empty={{ title: 'No quotes in this period' }} />
      )}

      <div className="grid-equal lg:grid-cols-2">
        <div>
          <DataTable title="Project pipeline" exportTitle="Project pipeline" cols={pipelineCols} rows={pipeline as unknown as Row[]} rowKey="status"
            initialSort={{ key: 'label', dir: 1 }} hideSearch
            toolbar={<a href="/projects" className="btn-secondary btn-sm">Projects</a>}
            empty={{ title: 'No projects yet' }} />
        </div>
        <div>
          <ChartCard title="Inventory value by category" subtitle="On hand, at cost"><HBars data={invByCat} format={compactINR} /></ChartCard>
        </div>
      </div>

      <div className="grid-equal lg:grid-cols-2">
        <div>
          <ChartCard title="Purchase spend by category" subtitle={`Purchase order lines, ${period.label.toLowerCase() === 'all time' ? 'all time' : scope}`}><HBars data={spendByCat} format={compactINR} /></ChartCard>
        </div>
        <div>
          <ChartCard title="Quoted value by company" subtitle={period.label}>
            <HBars data={companies.map(c => ({ label: c.shortName, value: (quotes ?? []).filter(q => (q.company ?? 'STC') === c.id && inPeriod(q.date, period)).reduce((s, q) => s + totalOf(q), 0) }))} format={compactINR} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  return <Gate module="analytics"><AnalyticsInner /></Gate>
}
