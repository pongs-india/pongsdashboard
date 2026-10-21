import { Pencil } from 'lucide-react'
import type { Quote } from '@/lib/types'
import { StatusBadge } from '@/components/ui'
import QuoteNextStep from '@/components/QuoteNextStep'
import PrintButton from '@/components/PrintButton'
import { fmtDate } from '@/lib/format'

const TIER_LABEL: Record<string, string> = {
  dealer: 'Dealer', msp: 'MSP', specifiors: 'Specifier', manual: 'Manual rates', manual_custom: 'Custom lines',
}

export type QuoteTab = 'overview' | 'internal' | 'revisions' | 'client'

// Shared header for every quote view: identity, status, primary actions and
// the tab strip that moves between the team, cost, revision and client views.
export default function QuoteHeader({
  quote,
  active,
  projectId,
  printable = true,
}: {
  quote: Quote
  active: QuoteTab
  projectId?: string | null
  printable?: boolean
}) {
  const rev = Number(quote.revision ?? 0)
  const date = quote.date ? fmtDate(quote.date) : null
  const valid = quote.validUntil ? fmtDate(quote.validUntil) : null
  const tabs: { id: QuoteTab; label: string; href: string }[] = [
    { id: 'overview', label: 'Overview', href: `/quotes/${quote.id}/team` },
    { id: 'internal', label: 'Cost review', href: `/quotes/${quote.id}/internal` },
    { id: 'revisions', label: 'Revisions', href: `/quotes/${quote.id}/revisions` },
    { id: 'client', label: 'Client PDF', href: `/quotes/${quote.id}/client` },
  ]

  return (
    <div className="no-print mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="mono font-medium text-gray-700">{quote.quoteNumber}</span>
            {rev > 0 && <span className="badge-neutral">Revision {rev}</span>}
            <StatusBadge status={quote.status ?? 'draft'} />
          </div>
          <h1 className="mt-2 text-xl sm:text-[22px] font-semibold tracking-tight text-gray-900 truncate">{quote.clientName || 'Untitled client'}</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {[quote.projectName, quote.location, `${quote.company ?? 'STC'} · ${TIER_LABEL[quote.priceTier] ?? quote.priceTier}${quote.markupPercent > 0 ? ` +${quote.markupPercent}%` : ''}`, date ? `Issued ${date}` : null, valid ? `Valid until ${valid}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a href={`/quotes/${quote.id}/edit`} className="btn-secondary"><Pencil size={14} /> Edit</a>
          {printable && <PrintButton />}
        </div>
      </div>
      <div className="mt-5">
        <QuoteNextStep quoteId={quote.id} status={String(quote.status ?? 'draft')} projectId={projectId ?? null}
          clientName={quote.clientName} onClientTab={active === 'client'} />
      </div>
      <nav className="tabs mt-5" aria-label="Quote views">
        {tabs.map(t => (
          <a key={t.id} href={t.href} className="tab" data-active={t.id === active} aria-current={t.id === active ? 'page' : undefined}>{t.label}</a>
        ))}
      </nav>
    </div>
  )
}

