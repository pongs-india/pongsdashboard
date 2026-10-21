'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, FileText, PackageCheck, Plus } from 'lucide-react'
import { useMe, can } from '@/lib/useMe'
import type { Quote } from '@/lib/types'
import { calculateQuote, fmtINR } from '@/lib/calculations'
import { fmtDate, fmtDateLong, monthShort, toDate } from '@/lib/format'
import { PageHeader, Stat, StatGrid, StatusBadge, EmptyState, LoadingRows, PageLoading } from '@/components/ui'
import { AttentionCard, GettingStarted, type SetupStep } from '@/components/Guidance'
import { buildAttention } from '@/lib/attention'
import { navigate } from '@/lib/navigate'

type Row = Record<string, unknown>

function totalOf(q: Quote) {
  try { return calculateQuote(q).grandTotal } catch { return 0 }
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// The Dashboard is an admin-controlled board. Users without explicit dashboard
// access are routed to the Quotes module instead of being shown an error.
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
    const count = (url: string, set: (n: number) => void) =>
      fetch(url).then(r => r.json()).then(d => set(Array.isArray(d) ? d.length : 0)).catch(() => { /* optional */ })
    if (canInventory) count('/api/inventory/products', setProductCount)
    if (canClients) count('/api/clients', setClientCount)
    if (canFinance) fetch('/api/finance').then(r => r.json()).then(d => setFinance(Array.isArray(d) ? d : [])).catch(() => setFinance([]))
    if (isAdmin) {
      count('/api/users', setUserCount)
      count('/api/access-requests?status=pending', setPendingRequests)
    }
  }, [me, canQuotes, canProjects, canInventory, canClients, canFinance, isAdmin])

  if (loading) return <PageLoading />

  if (!can(me, 'dashboard', 'view')) {
    if (typeof window !== 'undefined') window.location.replace('/quotes')
    return null
  }

  const q = quotes ?? []
  const status = (x: Quote) => String((x as unknown as Row).status ?? 'draft')
  const month = new Date().toISOString().slice(0, 7)
  const open = q.filter(x => ['draft', 'sent'].includes(status(x)))
  const won = q.filter(x => status(x) === 'approved')
  const decided = q.filter(x => ['approved', 'rejected'].includes(status(x))).length
  const sentAwaiting = q.filter(x => status(x) === 'sent')

  const today = new Date().toISOString().slice(0, 10)
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)
  const p = projects ?? []
  const active = p.filter(x => !['completed', 'invoiced', 'cancelled'].includes(String(x.status)))
  const upcoming = p
    .filter(x => String(x.scheduled_date ?? '') >= today && String(x.scheduled_date ?? '') <= in14 && !['completed', 'invoiced', 'cancelled'].includes(String(x.status)))
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)))

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

  const recent = [...q].sort((a, b) => String(b.updatedAt ?? b.date).localeCompare(String(a.updatedAt ?? a.date))).slice(0, 6)
  const firstName = me?.name?.split(' ')[0]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={
          attentionLoading ? fmtDateLong(new Date(), { weekday: true })
            : `${fmtDateLong(new Date(), { weekday: true })} · ${attention.length === 0 ? 'Nothing needs your attention' : `${attention.length} ${attention.length === 1 ? 'thing needs' : 'things need'} your attention`}`
        }
        actions={canQuotes ? <a href="/quotes/new" className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New quote</a> : undefined}
      />

      {loadError && (
        <div className="alert-error mb-6" role="alert">
          <span><span className="font-medium">Some data could not be loaded.</span> {loadError}</span>
        </div>
      )}

      <GettingStarted steps={setup} extra={isAdmin && q.length === 0 ? (
        <>Just exploring? <a href="/admin/import" className="font-medium text-gray-900 underline-offset-2 hover:underline">Load sample data</a> to see the app with realistic records. You can remove it later.</>
      ) : undefined} />

      <StatGrid>
        {canQuotes && (
          <>
            <Stat label="Open pipeline" value={quotes ? fmtINR(open.reduce((s, x) => s + totalOf(x), 0)) : null}
              hint={quotes ? `${open.length} ${open.length === 1 ? 'quote' : 'quotes'} in draft or sent` : ' '} href="/quotes" />
            <Stat label="Won this month" value={quotes ? fmtINR(won.filter(x => x.date?.startsWith(month)).reduce((s, x) => s + totalOf(x), 0)) : null}
              hint={quotes ? (decided ? `${Math.round((won.length / decided) * 100)}% win rate overall` : 'No decisions yet') : ' '} tone={decided ? 'success' : 'neutral'} />
          </>
        )}
        {canProjects && (
          <>
            <Stat label="Active projects" value={projects ? active.length : null}
              hint={projects ? fmtINR(active.reduce((s, x) => s + Number(x.contract_value ?? 0), 0)) + ' contracted' : ' '} href="/projects" />
            <Stat label="Installs next 14 days" value={projects ? upcoming.length : null}
              hint={projects ? (upcoming[0] ? `Next on ${fmtDate(String(upcoming[0].scheduled_date))}` : 'Nothing scheduled') : ' '} href="/projects/calendar" />
          </>
        )}
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2 min-w-0">
          <AttentionCard items={attention} loading={attentionLoading} />
          {canQuotes && (
            <section className="table-wrap">
              <div className="card-header">
                <h2 className="card-title">Recent quotations</h2>
                <a href="/quotes" className="card-link">View all</a>
              </div>
              {!quotes ? <LoadingRows rows={5} cols={4} /> : recent.length === 0 ? (
                <EmptyState icon={FileText} title="No quotations yet" description="Your latest quotations will appear here."
                  action={<a href="/quotes/new" className="btn-secondary btn-sm"><Plus size={14} /> New quote</a>} compact />
              ) : (
                <div className="table-scroll">
                  <table className="table table-hover">
                    <tbody>
                      {recent.map(x => (
                        <tr key={x.id} className="cursor-pointer" onClick={e => navigate(`/quotes/${x.id}/team`, e)}>
                          <td className="w-[96px]"><span className="mono text-xs text-gray-500">{x.quoteNumber}</span></td>
                          <td className="max-w-[280px]">
                            <div className="truncate font-medium text-gray-900">{x.clientName}</div>
                            <div className="truncate text-xs text-gray-500">{[x.projectName, x.location].filter(Boolean).join(' · ') || '—'}</div>
                          </td>
                          <td className="hidden sm:table-cell"><StatusBadge status={status(x)} /></td>
                          <td className="num font-medium text-gray-900 whitespace-nowrap">{fmtINR(totalOf(x))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {quotes && sentAwaiting.length > 0 && (
                <div className="table-footer">
                  <span>{sentAwaiting.length} sent {sentAwaiting.length === 1 ? 'quote is' : 'quotes are'} awaiting a client decision</span>
                  <span className="tabular-nums">{fmtINR(sentAwaiting.reduce((s, x) => s + totalOf(x), 0))}</span>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-4">
          {canProjects && (
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Upcoming installations</h2>
                <a href="/projects/calendar" className="card-link">Schedule</a>
              </div>
              {!projects ? <LoadingRows rows={3} cols={2} /> : upcoming.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing in the next two weeks" description="Projects with an installation date appear here." compact />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {upcoming.slice(0, 5).map(x => {
                    const d = toDate(String(x.scheduled_date)) ?? new Date()
                    return (
                      <li key={String(x.id)}>
                        <a href={`/projects/${x.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                          <span className="flex w-10 shrink-0 flex-col items-center rounded-md border border-gray-200 bg-white py-1 leading-none">
                            <span className="text-2xs font-medium uppercase text-gray-500">{monthShort(d)}</span>
                            <span className="mt-0.5 text-[15px] font-semibold tabular-nums text-gray-900">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-gray-900">{String(x.name)}</span>
                            <span className="block truncate text-xs text-gray-500">
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
          )}

          {canInventory && (
            <section className="card">
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
                <ul className="divide-y divide-gray-100">
                  {lowStock.slice(0, 6).map(x => {
                    const cur = Number(x.current_stock ?? 0)
                    const min = Number(x.min_stock ?? 0)
                    const pct = min > 0 ? Math.min(100, Math.round((cur / min) * 100)) : 0
                    return (
                      <li key={String(x.id)} className="px-5 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-[13px] font-medium text-gray-900">{String(x.name)}</span>
                          <span className="shrink-0 text-xs tabular-nums text-gray-500">{cur} / {min}</span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-gray-100">
                          <div className={`h-1 rounded-full ${pct < 50 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
