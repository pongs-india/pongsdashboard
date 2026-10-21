'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, FileText, PackageCheck, Plus } from 'lucide-react'
import { useMe, can } from '@/lib/useMe'
import type { Quote } from '@/lib/types'
import { calculateQuote, fmtINR } from '@/lib/calculations'
import { fmtDate, fmtDateLong, monthShort, toDate } from '@/lib/format'
import { PageHeader, Stat, StatGrid, StatusBadge, EmptyState, LoadingRows, PageLoading } from '@/components/ui'
import { AttentionCard, GettingStarted, type SetupStep } from '@/components/Guidance'
import { buildAttention } from '@/lib/attention'
import { navigate } from '@/lib/navigate'
import { useFilters, FilterSelect, PeriodFilter, resolvePeriod, inPeriod } from '@/components/filters'
import { ChartCard, PairBars, Split, compactINR, lastMonths } from '@/components/miniCharts'
import { listCompanies } from '@/lib/companies'

type Row = Record<string, unknown>

function totalOf(q: Quote) {
  try { return calculateQuote(q).grandTotal } catch { return 0 }
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const STATUS_FILL: Record<string, string> = { draft: 'bg-line-hover', sent: 'bg-info-fill', approved: 'bg-success-fill', rejected: 'bg-danger-fill' }

// The dashboard answers, for the period, company and salesperson picked at the
// top: what was quoted and won, what is still open, what is being installed and
// what needs action. Users without dashboard access go to Quotes instead.
export default function HomePage() {
  const { me, loading } = useMe()
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [lowStock, setLowStock] = useState<Row[] | null>(null)
  const [finance, setFinance] = useState<Row[] | null>(null)
  const [clientCount, setClientCount] = useState<number | null>(null)
  const [productCount, setProductCount] = useState<number | null>(null)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [pendingRequests, setPendingRequests] = useState(0)
  const [loadError, setLoadError] = useState('')
  const f = useFilters({ period: 'fy', from: '', to: '', company: '', owner: '' })

  const canQuotes = can(me, 'quotes', 'view')
  const canProjects = can(me, 'projects', 'view')
  const canInventory = can(me, 'inventory', 'view')
  const canClients = can(me, 'clients', 'view')
  const canFinance = can(me, 'finance', 'view')
  const isAdmin = !!me?.isAdmin

  useEffect(() => {
    if (!me) return
    if (canQuotes) fetch('/api/quotes').then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok) setLoadError((d && d.error) ? String(d.error) : `The server returned ${r.status}.`)
      setQuotes(Array.isArray(d) ? d : [])
    }).catch(() => { setLoadError('Could not reach the server.'); setQuotes([]) })
    if (canProjects) fetch('/api/projects').then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => setProjects([]))
    if (canInventory) fetch('/api/notifications').then(r => r.json()).then(d => setLowStock(d?.lowStock ?? [])).catch(() => setLowStock([]))
    // One request for every count the setup guide needs (permission-aware server side).
    fetch('/api/dashboard/counts').then(r => (r.ok ? r.json() : {})).then((c: Record<string, number>) => {
      if (canInventory && typeof c.products === 'number') setProductCount(c.products)
      if (canClients && typeof c.clients === 'number') setClientCount(c.clients)
      if (isAdmin) {
        if (typeof c.users === 'number') setUserCount(c.users)
        if (typeof c.pendingRequests === 'number') setPendingRequests(c.pendingRequests)
      }
    }).catch(() => { /* optional: the guide simply omits these steps */ })
    if (canFinance) fetch('/api/finance').then(r => r.json()).then(d => setFinance(Array.isArray(d) ? d : [])).catch(() => setFinance([]))
  }, [me, canQuotes, canProjects, canInventory, canClients, canFinance, isAdmin])

  const v = f.values
  const period = resolvePeriod(v.period, v.from, v.to)
  const status = (x: Quote) => String((x as unknown as Row).status ?? 'draft')

  // Company and salesperson narrow every quote figure; the period narrows by quote date.
  const scoped = useMemo(() => (quotes ?? []).filter(q =>
    (!v.company || (q.company ?? 'STC') === v.company) && (!v.owner || q.ownerEmail === v.owner)), [quotes, v.company, v.owner])
  const inRange = useMemo(() => scoped.filter(q => inPeriod(q.date, period)), [scoped, period.from, period.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const owners = useMemo(() => Array.from(new Set((quotes ?? []).map(q => q.ownerEmail).filter(Boolean) as string[])).sort(), [quotes])

  if (loading) return <PageLoading />

  if (!can(me, 'dashboard', 'view')) {
    if (typeof window !== 'undefined') window.location.replace('/quotes')
    return null
  }

  const q = quotes ?? []
  const quoted = inRange.reduce((s, x) => s + totalOf(x), 0)
  const won = inRange.filter(x => status(x) === 'approved')
  const decided = inRange.filter(x => ['approved', 'rejected'].includes(status(x))).length
  const open = inRange.filter(x => ['draft', 'sent'].includes(status(x)))
  const sentAwaiting = scoped.filter(x => status(x) === 'sent')

  const today = new Date().toISOString().slice(0, 10)
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)
  const p = projects ?? []
  const active = p.filter(x => !['completed', 'invoiced', 'cancelled'].includes(String(x.status)))
  const upcoming = p
    .filter(x => String(x.scheduled_date ?? '') >= today && String(x.scheduled_date ?? '') <= in14 && !['completed', 'invoiced', 'cancelled'].includes(String(x.status)))
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)))
  const outstanding = (finance ?? []).reduce((s, x) => s + Math.max(0, Number(x.contract_value ?? 0) - Number(x.total_paid ?? 0)), 0)

  const attention = buildAttention({
    quotes: canQuotes ? quotes : null,
    projects: canProjects ? projects : null,
    finance: canFinance ? finance : null,
    lowStock: canInventory ? lowStock : null,
    pendingRequests,
    fmtMoney: fmtINR,
  })
  const attentionLoading = (canQuotes && !quotes) || (canProjects && !projects)

  // First-run guide. A step only appears when this user can act on it.
  const firstDraft = q.find(x => status(x) === 'draft')
  const toConvert = q.find(x => status(x) === 'approved' && !p.some(pr => pr.quote_id === x.id))
  const setup: SetupStep[] = []
  if (canClients && clientCount !== null) setup.push({ id: 'client', title: 'Add your first client', description: 'Keep contacts in one place. Their quotes and projects link to them automatically.', done: clientCount > 0, href: '/clients?new=1', cta: 'Add client' })
  if (canQuotes && quotes) {
    setup.push({ id: 'quote', title: 'Create a quotation', description: 'Enter the ceiling sizes and options. Pricing, area and GST are calculated for you.', done: q.length > 0, href: '/quotes/new', cta: 'New quote' })
    setup.push({ id: 'send', title: 'Send a quote to a client', description: 'Open the quote, share the client PDF and mark it as sent so it is tracked for follow-up.', done: q.some(x => status(x) !== 'draft'), href: firstDraft ? `/quotes/${firstDraft.id}/team` : '/quotes', cta: 'Open quote' })
  }
  if (canProjects && projects) setup.push({ id: 'project', title: 'Turn an approved quote into a project', description: 'Projects carry the schedule, team, site checklist and payments.', done: p.length > 0, href: toConvert ? `/quotes/${toConvert.id}/team` : '/quotes', cta: toConvert ? 'Convert' : 'View quotes' })
  if (canInventory && productCount !== null) setup.push({ id: 'products', title: 'Add your inventory products', description: 'Track fabric, profiles and lighting stock, and get reorder alerts.', done: productCount > 0, href: '/inventory/products?new=1', cta: 'Add product' })
  if (isAdmin && userCount !== null) setup.push({ id: 'team', title: 'Invite your team', description: 'Give sales, installers and managers access to just the modules they need.', done: userCount > 1, href: '/users/all?new=1', cta: 'Add user' })

  const recent = [...inRange].sort((a, b) => String(b.updatedAt ?? b.date).localeCompare(String(a.updatedAt ?? a.date))).slice(0, 7)
  const months = lastMonths(12)
  const monthly = months.map(m => {
    const inMonth = scoped.filter(x => String(x.date ?? '').startsWith(m.key))
    return { label: m.label, a: inMonth.reduce((s, x) => s + totalOf(x), 0), b: inMonth.filter(x => status(x) === 'approved').reduce((s, x) => s + totalOf(x), 0) }
  })
  const byStatus = ['draft', 'sent', 'approved', 'rejected'].map(s => ({
    label: s.charAt(0).toUpperCase() + s.slice(1), color: STATUS_FILL[s],
    value: inRange.filter(x => status(x) === s).reduce((t, x) => t + totalOf(x), 0),
  }))
  const firstName = me?.name?.split(' ')[0]
  const companies = listCompanies()
  const companyName = v.company ? companies.find(c => c.id === v.company)?.shortName : null
  const filtered = v.period !== 'fy' || !!(v.from || v.to || v.company || v.owner)

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={
          attentionLoading ? fmtDateLong(new Date(), { weekday: true })
            : `${fmtDateLong(new Date(), { weekday: true })} · ${attention.length === 0 ? 'Nothing needs your attention' : `${attention.length} ${attention.length === 1 ? 'thing needs' : 'things need'} your attention`}`
        }
        actions={canQuotes ? <a href="/quotes/new" className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New quote</a> : undefined}
      />

      {loadError && (
        <div className="alert-error" role="alert">
          <span><span className="font-medium">Some data could not be loaded.</span> {loadError}</span>
        </div>
      )}

      <GettingStarted steps={setup} extra={isAdmin && q.length === 0 ? (
        <>Just exploring? <a href="/admin/import" className="font-medium text-ink underline-offset-2 hover:underline">Load sample data</a> to see the app with realistic records. You can remove it later.</>
      ) : undefined} />

      {canQuotes && (
        <div className="no-print flex flex-wrap items-center gap-2">
          <PeriodFilter period={v.period} from={v.from} to={v.to} dateLabel="Quote date" onChange={x => f.set(x)} />
          <FilterSelect value={v.company} onChange={x => f.set({ company: x })} all="All companies" className="w-full sm:w-40"
            options={companies.map(c => ({ value: c.id, label: c.shortName }))} />
          {isAdmin && owners.length > 1 && (
            <FilterSelect value={v.owner} onChange={x => f.set({ owner: x })} all="All salespeople" className="w-full sm:w-56"
              options={owners.map(o => ({ value: o, label: o }))} />
          )}
          {filtered && <button type="button" className="btn-ghost btn-sm" onClick={f.clear}>Reset</button>}
        </div>
      )}

      <StatGrid cols={canFinance ? 5 : 4}>
        {canQuotes && (
          <>
            <Stat label="Quoted" value={quotes ? fmtINR(quoted) : null} href="/quotes"
              hint={quotes ? `${inRange.length} ${inRange.length === 1 ? 'quote' : 'quotes'} in the period` : undefined} />
            <Stat label="Won" value={quotes ? fmtINR(won.reduce((s, x) => s + totalOf(x), 0)) : null} href="/quotes?status=approved"
              hint={quotes ? (decided ? `${Math.round((won.length / decided) * 100)}% win rate on decided quotes` : 'No decisions in the period') : undefined} tone={decided ? 'success' : 'neutral'} />
            <Stat label="Open pipeline" value={quotes ? fmtINR(open.reduce((s, x) => s + totalOf(x), 0)) : null} href="/quotes?status=sent"
              hint={quotes ? `${open.length} in draft or sent` : undefined} />
          </>
        )}
        {canProjects && (
          <Stat label="Active projects" value={projects ? active.length : null} href="/projects/all"
            hint={projects ? `${fmtINR(active.reduce((s, x) => s + Number(x.contract_value ?? 0), 0))} contracted · ${upcoming.length} installing soon` : undefined} />
        )}
        {canFinance && (
          <Stat label="Outstanding" value={finance ? fmtINR(outstanding) : null} href="/finance?view=outstanding"
            hint={finance ? 'Due from clients across projects' : undefined} tone={outstanding > 0 ? 'warning' : 'neutral'} />
        )}
      </StatGrid>

      {canQuotes && (
        <div className="grid-equal lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Quoted and won per month" subtitle={['Last 12 months', companyName, v.owner].filter(Boolean).join(', ')}>
              {quotes ? <PairBars data={monthly} names={['Quoted', 'Won']} /> : <div className="skeleton h-[200px]" />}
            </ChartCard>
          </div>
          <div>
            <ChartCard title="Pipeline by status" subtitle={`Quote value · ${period.key === 'custom' ? `${fmtDate(period.from)} to ${fmtDate(period.to)}` : period.label}`}>
              {quotes ? <Split parts={byStatus} format={compactINR} /> : <div className="skeleton h-[120px]" />}
            </ChartCard>
          </div>
        </div>
      )}

      <div className="grid-equal lg:grid-cols-3">
        <div className="lg:col-span-2"><AttentionCard items={attention} loading={attentionLoading} /></div>
        {canProjects && (
          <div>
            <section className="card flex flex-col">
              <div className="card-header">
                <h2 className="card-title">Upcoming installations</h2>
                <a href="/projects/calendar" className="card-link">Schedule</a>
              </div>
              {!projects ? <LoadingRows rows={3} cols={2} /> : upcoming.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing in the next two weeks" description="Projects with an installation date appear here." compact />
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.slice(0, 5).map(x => {
                    const d = toDate(String(x.scheduled_date)) ?? new Date()
                    return (
                      <li key={String(x.id)}>
                        <a href={`/projects/${x.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt">
                          <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-line bg-white py-1 leading-none">
                            <span className="text-[10px] font-medium uppercase text-faint">{monthShort(d)}</span>
                            <span className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-ink">{String(x.name)}</span>
                            <span className="block truncate text-[12px] text-faint">
                              {[x.client_name, x.team_lead ? `Lead: ${x.team_lead}` : null].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="grid-equal lg:grid-cols-3">
        {canQuotes && (
          <div className="lg:col-span-2">
            <section className="card flex flex-col overflow-hidden">
              <div className="card-header">
                <div className="flex items-baseline gap-2"><h2 className="card-title">Recent quotations</h2>{quotes && <span className="count">{period.label}</span>}</div>
                <a href="/quotes" className="card-link">View all</a>
              </div>
              {!quotes ? <LoadingRows rows={5} cols={4} /> : recent.length === 0 ? (
                <EmptyState icon={FileText} title={q.length ? 'No quotations in this period' : 'No quotations yet'}
                  description={q.length ? 'Pick a longer period or another company to see more.' : 'Your latest quotations will appear here.'}
                  action={q.length ? <button type="button" className="btn-secondary btn-sm" onClick={f.clear}>Reset filters</button> : <a href="/quotes/new" className="btn-secondary btn-sm"><Plus size={14} /> New quote</a>} compact />
              ) : (
                <div className="flex-1 overflow-x-auto">
                  <table className="table table-hover">
                    <thead><tr><th className="w-[104px]">Quote</th><th>Client and project</th><th className="hidden sm:table-cell">Status</th><th className="hidden md:table-cell">Date</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {recent.map(x => (
                        <tr key={x.id} className="cursor-pointer" onClick={e => navigate(`/quotes/${x.id}/team`, e)}>
                          <td><span className="mono text-[12px] text-muted">{x.quoteNumber}</span></td>
                          <td className="max-w-[280px]">
                            <div className="truncate font-medium text-ink">{x.clientName}</div>
                            <div className="truncate text-[12px] text-faint">{[x.projectName, x.location].filter(Boolean).join(' · ') || '—'}</div>
                          </td>
                          <td className="hidden sm:table-cell"><StatusBadge status={status(x)} /></td>
                          <td className="hidden md:table-cell whitespace-nowrap text-muted">{fmtDate(x.date)}</td>
                          <td className="num whitespace-nowrap font-medium text-ink">{fmtINR(totalOf(x))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {quotes && sentAwaiting.length > 0 && (
                <div className="table-footer">
                  <span>{sentAwaiting.length} sent {sentAwaiting.length === 1 ? 'quote is' : 'quotes are'} awaiting a client decision</span>
                  <span className="tabular-nums text-ink">{fmtINR(sentAwaiting.reduce((s, x) => s + totalOf(x), 0))}</span>
                </div>
              )}
            </section>
          </div>
        )}

        {canInventory && (
          <div>
            <section className="card flex flex-col">
              <div className="card-header">
                <h2 className="card-title">Stock alerts</h2>
                <a href="/inventory/reorder" className="card-link">Reorder list</a>
              </div>
              {!lowStock ? <LoadingRows rows={3} cols={2} /> : lowStock.length === 0 ? (
                productCount === 0 ? (
                  <EmptyState icon={PackageCheck} title="No products tracked yet" description="Add products to get alerts before stock runs out."
                    action={<a href="/inventory/products?new=1" className="btn-secondary btn-sm">Add product</a>} compact />
                ) : <EmptyState icon={PackageCheck} title="All products above minimum" compact />
              ) : (
                <ul className="divide-y divide-line">
                  {lowStock.slice(0, 6).map(x => {
                    const cur = Number(x.current_stock ?? 0)
                    const min = Number(x.min_stock ?? 0)
                    const pct = min > 0 ? Math.min(100, Math.round((cur / min) * 100)) : 0
                    return (
                      <li key={String(x.id)}>
                        <a href={`/inventory/products/${x.id}`} className="block px-4 py-2.5 hover:bg-surface-alt">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[13.5px] font-medium text-ink">{String(x.name)}</span>
                            <span className="shrink-0 text-[12px] tabular-nums text-faint">{cur} / {min}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-track">
                            <div className={`h-1.5 rounded-full ${pct < 50 ? 'bg-danger-fill' : 'bg-warning-fill'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
