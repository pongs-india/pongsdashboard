'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Trash2, Copy, ChevronDown, GitBranch, History, MoreHorizontal,
  FileText, Pencil, FileDown,
} from 'lucide-react'
import type { Quote } from '@/lib/types'
import { fmtINR, calculateQuote } from '@/lib/calculations'
import { listCompanies } from '@/lib/companies'
import { PageHeader, Stat, StatGrid, EmptyState, LoadingRows, SearchInput, StatusBadge, statusDot } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import { confirmDialog, toast } from '@/components/feedback'
import { Menu, MenuItem, MenuSeparator } from '@/components/controls'
import { navigate } from '@/lib/navigate'
import { useMe } from '@/lib/useMe'
import { useSort, SortHeader, usePagination, Pagination, downloadCsv, ExportButton, useUrlState } from '@/components/table'

const TIER_LABEL: Record<string, string> = {
  dealer: 'Dealer', msp: 'MSP', specifiors: 'Specifier', manual: 'Manual', manual_custom: 'Custom',
}

type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected'
const STATUSES: QuoteStatus[] = ['draft', 'sent', 'approved', 'rejected']
const STATUS_LABELS: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent', approved: 'Approved', rejected: 'Rejected' }

function getStatus(quote: Quote): QuoteStatus {
  return ((quote as unknown as Record<string, unknown>).status as QuoteStatus) ?? 'draft'
}

function totalOf(q: Quote) {
  try { return calculateQuote(q).grandTotal } catch { return 0 }
}

// Shared register used by both the Dashboard (`/`) and the Quotes module
// (`/quotes`). Ownership scoping is enforced server-side, so a standard user's
// list already contains only their own quotes.
export default function QuoteRegister({ variant = 'dashboard' }: { variant?: 'dashboard' | 'quotes' }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [search, setSearch] = useUrlState('q', '')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [statusParam, setStatusFilter] = useUrlState('status', 'all')
  const statusFilter = (STATUSES as string[]).includes(statusParam) ? statusParam as QuoteStatus : 'all'
  const [companyFilter, setCompanyFilter] = useUrlState('company', 'all')
  const { me } = useMe()
  const isAdmin = !!me?.isAdmin

  const fetchQuotes = useCallback(async (q = '', company = 'all') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/quotes?q=${encodeURIComponent(q)}&company=${encodeURIComponent(company)}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setLoadError((data && data.error) ? String(data.error) : `The server returned ${res.status}.`)
        setQuotes([])
      } else {
        setLoadError('')
        setQuotes(Array.isArray(data) ? data : [])
      }
    } catch {
      setLoadError('Could not reach the server.')
      setQuotes([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchQuotes(search, companyFilter), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, companyFilter, fetchQuotes])

  const value = quotes.reduce((s, q) => s + totalOf(q), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthQuotes = quotes.filter(q => q.date?.startsWith(thisMonth))
  const thisMonthValue = thisMonthQuotes.reduce((s, q) => s + totalOf(q), 0)
  const approved = quotes.filter(q => getStatus(q) === 'approved')
  const approvedValue = approved.reduce((s, q) => s + totalOf(q), 0)
  const decided = quotes.filter(q => ['approved', 'rejected'].includes(getStatus(q))).length
  const conversionRate = decided > 0 ? Math.round((approved.length / decided) * 100) : 0
  const openValue = quotes.filter(q => ['draft', 'sent'].includes(getStatus(q))).reduce((s, q) => s + totalOf(q), 0)

  const statusCounts = STATUSES.map(s => ({ s, n: quotes.filter(q => getStatus(q) === s).length }))
  const filtered = statusFilter === 'all' ? quotes : quotes.filter(q => getStatus(q) === statusFilter)
  const { sorted, sort, toggle } = useSort(filtered, {
    number: q => q.quoteNumber,
    client: q => q.clientName,
    date: q => q.date,
    status: q => STATUSES.indexOf(getStatus(q)),
    amount: q => totalOf(q),
  }, { key: 'date', dir: 'desc' })
  const pager = usePagination(sorted, 25)

  function exportCsv() {
    downloadCsv('pongs-quotes', ['Quote', 'Revision', 'Client', 'Project', 'Location', 'Company', 'Pricing', 'Date', 'Valid until', 'Status', 'Amount (INR)'],
      sorted.map(q => [q.quoteNumber, Number(q.revision ?? 0) || '', q.clientName, q.projectName, q.location, q.company ?? 'STC',
        TIER_LABEL[q.priceTier] ?? q.priceTier, q.date, q.validUntil, STATUS_LABELS[getStatus(q)], Math.round(totalOf(q))]))
  }

  // Optimistic, with rollback: the badge changes at once and reverts if the save fails.
  async function updateStatus(id: string, status: QuoteStatus) {
    const quote = quotes.find(q => q.id === id)
    if (!quote) return
    const previous = getStatus(quote)
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } as Quote : q))
    const res = await fetch(`/api/quotes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...quote, status }),
    }).catch(() => null)
    if (!res?.ok) {
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: previous } as Quote : q))
      toast('Could not change the status. Please try again.', { tone: 'error' })
      return
    }
    toast(`${quote.quoteNumber} marked ${STATUS_LABELS[status].toLowerCase()}`)
  }

  async function deleteQuote(id: string, name: string) {
    const ok = await confirmDialog({ title: 'Delete quote', body: `The quote for "${name}" will be permanently deleted.`, confirmLabel: 'Delete quote', tone: 'danger' })
    if (!ok) return
    setBusy(id)
    const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) { toast('Could not delete the quote', { tone: 'error' }); return }
    setQuotes(prev => prev.filter(q => q.id !== id))
    toast('Quote deleted')
  }

  async function duplicateQuote(quote: Quote) {
    setBusy(quote.id)
    const payload = {
      ...quote,
      id: undefined,
      quoteNumber: undefined,
      clientName: quote.clientName + ' (Copy)',
      status: 'draft',
      date: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    }
    const res = await fetch('/api/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy(null)
    const created = await res.json().catch(() => null)
    if (!res.ok || !created?.id) { toast('Could not duplicate the quote', { tone: 'error' }); return }
    navigate(`/quotes/${created.id}/edit`)
  }

  // Create a linked revision (never overwrites the original) then open it for editing.
  async function reviseQuote(quote: Quote) {
    setBusy(quote.id)
    const res = await fetch(`/api/quotes/${quote.id}/revisions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) { toast('Could not create a revision', { tone: 'error' }); return }
    const created = await res.json()
    navigate(`/quotes/${created.id}/edit`)
  }

  const companies = [{ id: 'all', label: 'All companies' }, ...listCompanies().map(c => ({ id: c.id, label: c.shortName }))]
  const firstName = me?.name ? me.name.split(' ')[0] : null

  const heading = variant === 'quotes'
    ? 'Quotes'
    : (isAdmin ? 'Quotations' : firstName ? `${firstName}'s quotations` : 'My quotations')

  const description = variant === 'quotes'
    ? (isAdmin ? 'Every quotation issued across STC and NLS.' : 'Quotations you have created.')
    : 'Pipeline overview and the latest quotations.'

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={heading}
        description={description}
        actions={
          <>
            <div className="segmented" role="group" aria-label="Company">
              {companies.map(c => (
                <button key={c.id} type="button" aria-pressed={companyFilter === c.id} data-active={companyFilter === c.id} onClick={() => setCompanyFilter(c.id)}>{c.label}</button>
              ))}
            </div>
            <ExportButton onClick={exportCsv} disabled={loading || sorted.length === 0} />
            <a href="/quotes/new" className="btn-primary"><Plus size={15} strokeWidth={2.25} /> New quote</a>
          </>
        }
      />

      <StatGrid>
        <Stat label={isAdmin ? 'Total quotes' : 'My quotes'} value={loading ? null : quotes.length}
          hint={loading ? ' ' : `${thisMonthQuotes.length} created this month`} />
        <Stat label="Open pipeline" value={loading ? null : fmtINR(openValue)} hint="Draft and sent" />
        <Stat label="Won" value={loading ? null : fmtINR(approvedValue)}
          hint={decided ? `${conversionRate}% win rate on decided quotes` : 'No decisions yet'} tone={decided ? 'success' : 'neutral'} />
        <Stat label="Quoted this month" value={loading ? null : fmtINR(thisMonthValue)} hint={`${fmtINR(value)} across all quotes`} />
      </StatGrid>

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-0.5 px-0.5">
            <button type="button" className="chip" aria-pressed={statusFilter === 'all'} data-active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              All <span className="tabular-nums opacity-60">{quotes.length}</span>
            </button>
            {statusCounts.map(({ s, n }) => (
              <button key={s} type="button" className="chip" aria-pressed={statusFilter === s} data-active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
                <span className={`dot ${statusDot(s)}`} />
                {STATUS_LABELS[s]} <span className="tabular-nums opacity-60">{n}</span>
              </button>
            ))}
          </div>
          <SearchInput placeholder="Search client, project, number" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <LoadingRows rows={6} cols={5} />
        ) : loadError ? (
          <div className="p-5">
            <div className="alert-error" role="alert">
              <span><span className="font-medium">Quotations could not be loaded.</span> {loadError}</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search ? 'No quotes match your search' : statusFilter !== 'all' ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} quotes` : 'No quotations yet'}
            description={search ? 'Try a client name, project or quote number.' : statusFilter === 'all' ? 'Create a quotation to start building your pipeline.' : undefined}
            action={!search && statusFilter === 'all' ? <a href="/quotes/new" className="btn-primary"><Plus size={15} /> New quote</a> : undefined}
          />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <SortHeader label="Quote" sortKey="number" sort={sort} onSort={toggle} className="w-[110px]" />
                  <SortHeader label="Client and project" sortKey="client" sort={sort} onSort={toggle} />
                  <th className="hidden md:table-cell">Pricing</th>
                  <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggle} className="hidden lg:table-cell" />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                  <SortHeader label="Amount" sortKey="amount" sort={sort} onSort={toggle} align="right" />
                  <th className="w-12"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map(quote => (
                  <QuoteRow key={quote.id} quote={quote} busy={busy === quote.id}
                    onDelete={() => deleteQuote(quote.id, quote.clientName)}
                    onDuplicate={() => duplicateQuote(quote)}
                    onRevise={() => reviseQuote(quote)}
                    onStatusChange={s => updateStatus(quote.id, s)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <Pagination {...pager} noun="quotes" summary={`Total ${fmtINR(filtered.reduce((s, q) => s + totalOf(q), 0))}`} />
        )}
      </div>
    </div>
  )
}

function QuoteRow({ quote, busy, onDelete, onDuplicate, onRevise, onStatusChange }: {
  quote: Quote
  busy: boolean
  onDelete: () => void
  onDuplicate: () => void
  onRevise: () => void
  onStatusChange: (s: QuoteStatus) => void
}) {
  const status = getStatus(quote)
  const date = fmtDate(quote.date)
  const itemCount = quote.items?.length ?? 0
  const rev = Number(quote.revision ?? 0)
  const grandTotal = totalOf(quote)
  const href = `/quotes/${quote.id}/team`

  return (
    <tr className={`cursor-pointer ${busy ? 'opacity-50' : ''}`} aria-busy={busy || undefined} onClick={e => {
      if ((e.target as HTMLElement).closest('button,a,[role=menu]')) return
      navigate(href, e)
    }}>
      <td>
        <a href={href} className="mono text-xs font-medium text-gray-900 hover:underline">{quote.quoteNumber}</a>
        {rev > 0 && <div className="mt-0.5 text-2xs text-gray-500">Revision {rev}</div>}
      </td>
      <td className="max-w-[340px]">
        <div className="truncate font-medium text-gray-900">{quote.clientName || 'Untitled client'}</div>
        <div className="truncate text-xs text-gray-500">
          {[quote.projectName, quote.location, `${itemCount} item${itemCount !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td className="hidden md:table-cell">
        <span className="text-xs text-gray-700">{quote.company ?? 'STC'}</span>
        <span className="text-xs text-gray-500"> · {TIER_LABEL[quote.priceTier] ?? quote.priceTier}</span>
      </td>
      <td className="hidden lg:table-cell text-xs text-gray-600 tabular-nums whitespace-nowrap">{date}</td>
      <td>
        <Menu align="start" width={168} label="Change status" trigger={p => (
          <button {...p} type="button" aria-label={`Status: ${STATUS_LABELS[status]}. Change status`} className="group inline-flex items-center gap-0.5 rounded-md">
            <StatusBadge status={status} />
            <ChevronDown size={13} className="text-gray-400 group-hover:text-gray-700" />
          </button>
        )}>
          {close => STATUSES.map(s => (
            <MenuItem key={s} role="menuitemradio" selected={s === status} onClick={() => { close(); if (s !== status) onStatusChange(s) }}>
              <span className="inline-flex items-center gap-2"><span className={`dot ${statusDot(s)}`} />{STATUS_LABELS[s]}</span>
            </MenuItem>
          ))}
        </Menu>
      </td>
      <td className="num font-medium text-gray-900 whitespace-nowrap">{grandTotal > 0 ? fmtINR(grandTotal) : '—'}</td>
      <td className="text-right">
        <Menu label="Quote actions" trigger={p => (
          <button {...p} type="button" className="btn-ghost btn-icon" aria-label="Quote actions" disabled={busy}>
            <MoreHorizontal size={16} />
          </button>
        )}>
          {close => (
            <>
              <MenuItem href={`/quotes/${quote.id}/edit`} icon={Pencil}>Edit quote</MenuItem>
              <MenuItem href={`/quotes/${quote.id}/client`} icon={FileDown}>Client PDF</MenuItem>
              <MenuItem href={`/quotes/${quote.id}/revisions`} icon={History}>Revision history</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); onRevise() }} icon={GitBranch}>Create revision</MenuItem>
              <MenuItem onClick={() => { close(); onDuplicate() }} icon={Copy}>Duplicate</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); onDelete() }} icon={Trash2} tone="danger">Delete</MenuItem>
            </>
          )}
        </Menu>
      </td>
    </tr>
  )
}


