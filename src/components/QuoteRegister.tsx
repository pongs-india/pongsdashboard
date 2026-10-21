'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Copy, ChevronDown, GitBranch, History, MoreHorizontal, FileText, Pencil, FileDown } from 'lucide-react'
import type { Quote } from '@/lib/types'
import { fmtINR, calculateQuote } from '@/lib/calculations'
import { listCompanies } from '@/lib/companies'
import { PageHeader, Stat, StatGrid, StatusBadge, statusDot } from '@/components/ui'
import { confirmDialog, toast } from '@/components/feedback'
import { Menu, MenuItem, MenuSeparator } from '@/components/controls'
import { navigate } from '@/lib/navigate'
import { useMe } from '@/lib/useMe'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, inPeriod, optionsFrom } from '@/components/filters'

const TIER_LABEL: Record<string, string> = {
  dealer: 'Dealer', msp: 'MSP', specifiors: 'Specifier', manual: 'Manual', manual_custom: 'Custom',
}

type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected'
const STATUSES: QuoteStatus[] = ['draft', 'sent', 'approved', 'rejected']
const STATUS_LABELS: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent', approved: 'Approved', rejected: 'Rejected' }
const VALIDITY: Record<string, string> = { valid: 'Still valid', expiring: 'Expiring within 7 days', expired: 'Expired' }

const getStatus = (quote: Quote): QuoteStatus => ((quote as unknown as Record<string, unknown>).status as QuoteStatus) ?? 'draft'
const totalOf = (q: Quote) => { try { return calculateQuote(q).grandTotal } catch { return 0 } }
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + 5.5 * 3600 * 1000 + n * 864e5).toISOString().slice(0, 10)

// The Quotes register. Ownership scoping is enforced server-side, so a standard
// user's list already contains only their own quotes.
export default function QuoteRegister(_props: { variant?: 'dashboard' | 'quotes' }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const { me } = useMe()
  const isAdmin = !!me?.isAdmin
  const f = useFilters({ status: '', company: '', tier: '', owner: '', from: '', to: '', validity: '' })
  const v = f.values

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/quotes')
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error((data && data.error) ? String(data.error) : `The server returned ${res.status}.`)
      setLoadError('')
      setQuotes(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not reach the server.')
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Everything except status also narrows the counts on the status tabs.
  const base = useMemo(() => quotes.filter(q => {
    if (v.company && (q.company ?? 'STC') !== v.company) return false
    if (v.tier && q.priceTier !== v.tier) return false
    if (v.owner && q.ownerEmail !== v.owner) return false
    if (!inPeriod(q.date, { from: v.from, to: v.to })) return false
    if (v.validity) {
      const until = String(q.validUntil ?? '')
      const t = today()
      if (v.validity === 'expired' && !(until && until < t)) return false
      if (v.validity === 'expiring' && !(until && until >= t && until <= plusDays(7))) return false
      if (v.validity === 'valid' && !(until && until >= t)) return false
    }
    return true
  }), [quotes, v.company, v.tier, v.owner, v.from, v.to, v.validity])
  const rows = useMemo(() => (v.status ? base.filter(q => getStatus(q) === v.status) : base), [base, v.status])

  const thisMonth = today().slice(0, 7)
  const approved = base.filter(q => getStatus(q) === 'approved')
  const decided = base.filter(q => ['approved', 'rejected'].includes(getStatus(q))).length
  const openValue = base.filter(q => ['draft', 'sent'].includes(getStatus(q))).reduce((s, q) => s + totalOf(q), 0)
  const monthQuotes = base.filter(q => q.date?.startsWith(thisMonth))

  // Optimistic, with rollback: the badge changes at once and reverts if the save fails.
  async function updateStatus(id: string, status: QuoteStatus) {
    const quote = quotes.find(q => q.id === id)
    if (!quote) return
    const previous = getStatus(quote)
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } as Quote : q))
    const res = await fetch(`/api/quotes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...quote, status }),
    }).catch(() => null)
    if (!res?.ok) {
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: previous } as Quote : q))
      toast('Could not change the status. Please try again.', { tone: 'error' })
      return
    }
    toast(`${quote.quoteNumber} marked ${STATUS_LABELS[status].toLowerCase()}`)
  }

  async function deleteQuote(q: Quote) {
    const ok = await confirmDialog({ title: 'Delete quote', body: `${q.quoteNumber} for "${q.clientName}" will be deleted. An administrator can restore it from the audit log for 30 days.`, confirmLabel: 'Delete quote', tone: 'danger' })
    if (!ok) return
    setBusy(q.id)
    const res = await fetch(`/api/quotes/${q.id}`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) { toast('Could not delete the quote', { tone: 'error' }); return }
    setQuotes(prev => prev.filter(x => x.id !== q.id))
    toast('Quote deleted')
  }

  async function duplicateQuote(quote: Quote) {
    setBusy(quote.id)
    const payload = {
      ...quote, id: undefined, quoteNumber: undefined, clientName: quote.clientName + ' (Copy)', status: 'draft',
      date: today(), validUntil: plusDays(30),
    }
    const res = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(null)
    const created = await res.json().catch(() => null)
    if (!res.ok || !created?.id) { toast('Could not duplicate the quote', { tone: 'error' }); return }
    navigate(`/quotes/${created.id}/edit`)
  }

  // Create a linked revision (never overwrites the original) then open it for editing.
  async function reviseQuote(quote: Quote) {
    setBusy(quote.id)
    const res = await fetch(`/api/quotes/${quote.id}/revisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setBusy(null)
    if (!res.ok) { toast('Could not create a revision', { tone: 'error' }); return }
    const created = await res.json()
    navigate(`/quotes/${created.id}/edit`)
  }

  const companies = listCompanies()
  const cols: Col[] = [
    { key: 'quoteNumber', label: 'Quote', className: 'w-[120px]', render: r => (
      <><a href={`/quotes/${r.id}/team`} className="mono text-[12px]">{String(r.quoteNumber)}</a>
        {Number(r.revision ?? 0) > 0 && <div className="text-[11px] text-faint">Revision {String(r.revision)}</div>}</>
    ) },
    { key: 'clientName', label: 'Client and project', sub: { key: '_sub', label: 'Project' }, render: r => <span className="font-medium">{String(r.clientName || 'Untitled client')}</span> },
    { key: 'company', label: 'Company', hideBelow: 'lg', value: r => String(r.company ?? 'STC') },
    { key: 'priceTier', label: 'Pricing', hideBelow: 'xl', value: r => TIER_LABEL[String(r.priceTier)] ?? String(r.priceTier ?? '') },
    { key: 'date', label: 'Date', kind: 'date', hideBelow: 'md' },
    { key: 'validUntil', label: 'Valid until', kind: 'date', hideBelow: 'xl', render: r => {
      const u = String(r.validUntil ?? '')
      if (!u) return <span className="text-faint">—</span>
      const expired = u < today() && ['draft', 'sent'].includes(getStatus(r as unknown as Quote))
      return <span className={expired ? 'text-danger' : ''}>{new Date(u).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{expired && <span className="sr-only"> (expired)</span>}</span>
    } },
    { key: 'status', label: 'Status', value: r => STATUS_LABELS[getStatus(r as unknown as Quote)], sortValue: r => STATUSES.indexOf(getStatus(r as unknown as Quote)), render: r => {
      const q = r as unknown as Quote
      const status = getStatus(q)
      return (
        <Menu align="start" width={168} label="Change status" trigger={p => (
          <button {...p} type="button" aria-label={`Status: ${STATUS_LABELS[status]}. Change status`} className="group inline-flex items-center gap-0.5 rounded-md">
            <StatusBadge status={status} /><ChevronDown size={13} className="text-faint group-hover:text-ink" />
          </button>
        )}>
          {close => STATUSES.map(s => (
            <MenuItem key={s} role="menuitemradio" selected={s === status} onClick={() => { close(); if (s !== status) updateStatus(q.id, s) }}>
              <span className="inline-flex items-center gap-2"><span className={`dot ${statusDot(s)}`} />{STATUS_LABELS[s]}</span>
            </MenuItem>
          ))}
        </Menu>
      )
    } },
    { key: 'amount', label: 'Amount', kind: 'money', total: true, value: r => Math.round(totalOf(r as unknown as Quote)) },
    { key: '_actions', label: 'Actions', noExport: true, noSort: true, className: 'w-px', render: r => {
      const q = r as unknown as Quote
      return (
        <Menu label="Quote actions" trigger={p => (
          <button {...p} type="button" className="icon-btn" aria-label={`Actions for ${q.quoteNumber}`} disabled={busy === q.id}><MoreHorizontal size={16} /></button>
        )}>
          {close => (
            <>
              <MenuItem href={`/quotes/${q.id}/edit`} icon={Pencil}>Edit quote</MenuItem>
              <MenuItem href={`/quotes/${q.id}/client`} icon={FileDown}>Client PDF</MenuItem>
              <MenuItem href={`/quotes/${q.id}/revisions`} icon={History}>Revision history</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); reviseQuote(q) }} icon={GitBranch}>Create revision</MenuItem>
              <MenuItem onClick={() => { close(); duplicateQuote(q) }} icon={Copy}>Duplicate</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); deleteQuote(q) }} icon={Trash2} tone="danger">Delete</MenuItem>
            </>
          )}
        </Menu>
      )
    } },
  ]
  const tableRows = rows.map(q => ({
    ...(q as unknown as Record<string, unknown>),
    _sub: [q.projectName, q.location, `${q.items?.length ?? 0} item${(q.items?.length ?? 0) === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
  }))

  const bandActive = !!(v.tier || v.owner || v.from || v.to || v.validity)
  const owners = optionsFrom(quotes, q => q.ownerEmail)
  const note = [
    v.status && STATUS_LABELS[v.status as QuoteStatus], v.company && companies.find(c => c.id === v.company)?.shortName,
    v.tier && TIER_LABEL[v.tier], v.owner, (v.from || v.to) && `Quote date ${v.from || 'start'} to ${v.to || 'today'}`,
    v.validity && VALIDITY[v.validity],
  ].filter(Boolean).join(' · ')

  return (
    <div className="page">
      <PageHeader
        title="Quotes"
        description={isAdmin ? 'Every quotation issued across STC and NLS.' : 'Quotations you have created.'}
        actions={<a href="/quotes/new" className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New quote</a>}
      />

      <StatGrid>
        <Stat label={isAdmin ? 'Quotes' : 'My quotes'} value={loading ? null : base.length} hint={loading ? undefined : `${monthQuotes.length} created this month`} />
        <Stat label="Open pipeline" value={loading ? null : fmtINR(openValue)} hint={loading ? undefined : 'Draft and sent'} />
        <Stat label="Won" value={loading ? null : fmtINR(approved.reduce((s, q) => s + totalOf(q), 0))}
          hint={loading ? undefined : decided ? `${Math.round((approved.length / decided) * 100)}% win rate on decided quotes` : 'No decisions yet'} tone={decided ? 'success' : 'neutral'} />
        <Stat label="Quoted this month" value={loading ? null : fmtINR(monthQuotes.reduce((s, q) => s + totalOf(q), 0))}
          hint={loading ? undefined : `${fmtINR(base.reduce((s, q) => s + totalOf(q), 0))} across the filtered quotes`} />
      </StatGrid>

      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="seg" role="group" aria-label="Status">
          <button type="button" aria-pressed={!v.status} data-active={!v.status} onClick={() => f.set({ status: '' })}>All {!loading && <span className="ml-1 tabular-nums opacity-70">{base.length}</span>}</button>
          {STATUSES.map(s => (
            <button key={s} type="button" aria-pressed={v.status === s} data-active={v.status === s} onClick={() => f.set({ status: v.status === s ? '' : s })}>
              {STATUS_LABELS[s]} {!loading && <span className="ml-1 tabular-nums opacity-70">{base.filter(q => getStatus(q) === s).length}</span>}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Company">
          <button type="button" aria-pressed={!v.company} data-active={!v.company} onClick={() => f.set({ company: '' })}>All companies</button>
          {companies.map(c => <button key={c.id} type="button" aria-pressed={v.company === c.id} data-active={v.company === c.id} onClick={() => f.set({ company: c.id })}>{c.shortName}</button>)}
        </div>
      </div>

      <DataTable
        title="Quotations"
        exportTitle="Quotes"
        cols={cols}
        rows={tableRows}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/quotes/${r.id}/team`}
        rowClass={r => (busy === r.id ? 'opacity-50' : '')}
        initialSort={{ key: 'date', dir: -1 }}
        searchPlaceholder="Search client, project, number"
        note={note || undefined}
        filters={<>
          <FilterSelect value={v.tier} onChange={x => f.set({ tier: x })} all="All price lists" className="w-full sm:w-40"
            options={Object.entries(TIER_LABEL).map(([value, label]) => ({ value, label }))} />
          {isAdmin && owners.length > 0 && <FilterSelect value={v.owner} onChange={x => f.set({ owner: x })} all="All salespeople" className="w-full sm:w-56" options={owners} />}
          <FilterSelect value={v.validity} onChange={x => f.set({ validity: x })} all="Any validity" className="w-full sm:w-48"
            options={Object.entries(VALIDITY).map(([value, label]) => ({ value, label }))} />
          <DateRange label="Quote date" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
        </>}
        filtersActive={bandActive || !!v.status || !!v.company}
        onClearFilters={f.clear}
        empty={{ icon: FileText, title: 'No quotations yet', description: 'Create a quotation to start building your pipeline.',
          action: <a href="/quotes/new" className="btn-primary btn-sm"><Plus size={14} /> New quote</a> }}
        summary={visible => `Total ${fmtINR(visible.reduce((s, r) => s + totalOf(r as unknown as Quote), 0))}`}
      />
    </div>
  )
}
