import { dbGetQuote, dbGetProjectIdForQuote } from "@/lib/db"
import { canAccessQuote } from "@/lib/session"
export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { calculateQuote, fmtINR, formatDims, round2 } from '@/lib/calculations'
import type { ItemBreakdown } from '@/lib/types'
import QuoteHeader from '@/components/QuoteHeader'

const LIGHT_LABEL: Record<string, string> = {
  none: 'No lighting', single_color: 'Single colour', single_color_dimmable: 'Single colour dimmable',
  tunable: 'Tunable white', tunable_dali: 'Tunable, DALI at site', rgb: 'RGB', rgbw: 'RGBW / NW / WW',
}

export default async function TeamPage({ params }: { params: { id: string } }) {
  const quote = await dbGetQuote(params.id)
  if (!quote) notFound()
  if (!(await canAccessQuote(quote.ownerEmail))) notFound()
  const projectId = await dbGetProjectIdForQuote(quote.id)

  const bd = calculateQuote(quote)
  const margin = bd.materialsTotalFinal - bd.materialsTotalDealer
  const marginPct = bd.materialsTotalDealer > 0
    ? ((margin / bd.materialsTotalDealer) * 100).toFixed(1)
    : '0'
  const installRate = quote.installationRatePerSqft ?? 120

  return (
    <div className="animate-fade-in">
      <QuoteHeader quote={quote} active="overview" projectId={projectId} />

      {/* Commercial summary */}
      <section className="card mb-6">
        <dl className="grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <Metric label="Dealer cost" value={fmtINR(bd.materialsTotalDealer)} hint="Materials at dealer rates" />
          <Metric label="Materials quoted" value={fmtINR(bd.materialsTotalFinal)}
            hint={quote.markupPercent > 0 ? `Includes ${quote.markupPercent}% markup` : 'At selected price list'} />
          <Metric label="Gross margin" value={fmtINR(margin)} hint={`${marginPct}% over dealer cost`} tone={margin >= 0 ? 'success' : 'danger'} />
          <Metric label="Installation" value={fmtINR(bd.totalInstallation)} hint={`₹${installRate} per sqft`} />
          <Metric label="Grand total" value={fmtINR(bd.grandTotal)} hint={quote.includeGst ? 'Including GST' : 'Excluding GST'} emphasis />
        </dl>
        {bd.totalSqft > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>Area <span className="ml-1 font-medium text-gray-800 tabular-nums">{bd.totalSqft.toFixed(1)} sqft</span></span>
            <span>Effective rate <span className="ml-1 font-medium text-gray-800 tabular-nums">{fmtINR(bd.pricePerSqft)}/sqft</span></span>
            {bd.transportCost > 0 && <span>Transport <span className="ml-1 font-medium text-gray-800 tabular-nums">{fmtINR(bd.transportCost)}</span></span>}
            {bd.gstAmount > 0 && <span>GST 18% <span className="ml-1 font-medium text-gray-800 tabular-nums">{fmtINR(bd.gstAmount)}</span></span>}
            {(quote.clientEmail || quote.clientPhone) && (
              <span className="lg:ml-auto">{[quote.clientEmail, quote.clientPhone].filter(Boolean).join(' · ')}</span>
            )}
          </div>
        )}
      </section>

      <div className="mb-3 flex items-end justify-between">
        <h2 className="section-title">Items</h2>
        <span className="text-xs text-gray-500">{bd.itemBreakdowns.length} item{bd.itemBreakdowns.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-4">
        {bd.itemBreakdowns.map((itemBd, idx) => (
          <ItemBreakdownCard key={itemBd.item.id} bd={itemBd} index={idx} installRate={installRate} />
        ))}
      </div>

      {/* Totals */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card p-5">
          <h2 className="card-title">Notes and terms</h2>
          {quote.notes
            ? <p className="mt-2 text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{quote.notes}</p>
            : <p className="mt-2 text-[13px] text-gray-500">No notes on this quotation.</p>}
        </section>
        <section className="card">
          <dl className="px-5 py-4 space-y-2.5 text-[13px]">
            <Row label="Materials at dealer cost" value={fmtINR(bd.materialsTotalDealer)} muted />
            <Row label={`Materials quoted${quote.markupPercent > 0 ? ` (+${quote.markupPercent}%)` : ''}`} value={fmtINR(bd.materialsTotalFinal)} />
            <Row label={`Installation at ₹${installRate}/sqft`} value={fmtINR(bd.totalInstallation)} />
            {bd.transportCost > 0 && <Row label="Transport" value={fmtINR(bd.transportCost)} />}
            <div className="border-t border-gray-100 pt-2.5">
              <Row label="Subtotal before GST" value={fmtINR(bd.subtotalBeforeGst)} strong />
            </div>
            {bd.gstAmount > 0 && <Row label="GST 18%" value={fmtINR(bd.gstAmount)} />}
          </dl>
          <div className="flex items-baseline justify-between border-t border-gray-200 bg-gray-50/60 px-5 py-4 rounded-b-lg">
            <span className="text-[13px] font-medium text-gray-900">Grand total</span>
            <span className="text-xl font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(bd.grandTotal)}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, hint, tone, emphasis }: { label: string; value: string; hint?: string; tone?: 'success' | 'danger'; emphasis?: boolean }) {
  const hintCls = tone === 'success' ? 'text-success-700' : tone === 'danger' ? 'text-red-700' : 'text-gray-500'
  return (
    <div className={`px-5 py-4 ${emphasis ? 'col-span-2 lg:col-span-1 bg-gray-50/60' : ''}`}>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 font-semibold tracking-tight text-gray-900 tabular-nums ${emphasis ? 'text-[22px]' : 'text-lg'}`}>{value}</dd>
      {hint && <dd className={`mt-0.5 text-xs ${hintCls}`}>{hint}</dd>}
    </div>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={muted ? 'text-gray-500' : strong ? 'font-medium text-gray-900' : 'text-gray-600'}>{label}</dt>
      <dd className={`tabular-nums ${muted ? 'text-gray-500' : strong ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{value}</dd>
    </div>
  )
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-gray-900 tabular-nums">{children}</dd>
    </div>
  )
}

function ItemBreakdownCard({ bd, index, installRate }: { bd: ItemBreakdown; index: number; installRate: number }) {
  const item = bd.item
  const qty = item.quantity
  const hasMultiple = qty > 1
  // A Manual (Custom) row carries no geometry — skip the fabric/dimension detail.
  const isCustom = bd.fabricDetail.panels.length === 0 && !bd.ledDetail
  const driverItems = bd.lineItems.filter(l => l.unit === 'nos')

  return (
    <section className="table-wrap">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-gray-200">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-700 tabular-nums">{index + 1}</span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-gray-900">
              {item.name || `Ceiling item ${index + 1}`}
              {hasMultiple && <span className="ml-2 font-normal text-gray-500">× {qty}</span>}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {isCustom
                ? `Custom line · ${qty} × ${fmtINR(round2(bd.itemTotal / (qty || 1)))}`
                : [
                    `${item.shape.charAt(0).toUpperCase() + item.shape.slice(1).replace('-', ' ')} ${formatDims(item)}`,
                    item.fabricType,
                    LIGHT_LABEL[item.lightType] ?? item.lightType,
                    bd.fabricDetail.hasJoint ? `Joint: ${bd.fabricDetail.jointPosition}` : null,
                  ].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-semibold text-gray-900 tabular-nums">{fmtINR(bd.itemTotal)}</p>
          <p className="text-xs text-gray-500 tabular-nums">Dealer {fmtINR(bd.subtotalDealer)} · Install {fmtINR(bd.installationCost)}</p>
        </div>
      </div>

      {!isCustom && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 px-5 py-4 bg-gray-50/60 border-b border-gray-200">
          <Spec label="Area">{round2(bd.areaM2).toFixed(2)} sqm</Spec>
          <Spec label="Perimeter">{round2(bd.perimeterM).toFixed(2)} m</Spec>
          <Spec label="Fabric billed">{bd.fabricDetail.totalBilledArea.toFixed(2)} sqm</Spec>
          <Spec label="Fabric used">{bd.fabricDetail.totalUsedArea.toFixed(2)} sqm</Spec>
          <Spec label="Waste">{bd.fabricDetail.totalWastageArea.toFixed(2)} sqm</Spec>
          {bd.ledDetail ? (
            <Spec label="LED">{bd.ledDetail.stripCount} × {bd.ledDetail.runningLengthM.toFixed(2)} m · {bd.ledDetail.totalWatts} W</Spec>
          ) : <Spec label="LED">None</Spec>}
          <div className="col-span-2 sm:col-span-4 lg:col-span-6 space-y-1 text-xs text-gray-600">
            {bd.fabricDetail.panels.map((panel, i) => (
              <p key={i} className="tabular-nums">
                <span className="font-medium text-gray-700">{bd.fabricDetail.panels.length > 1 ? `Panel ${i + 1}` : 'Roll'}</span>
                {' '}{panel.orientation} · billed {panel.panelArea.toFixed(2)} sqm · used {panel.usedArea.toFixed(2)} sqm · waste {panel.wastagePercent.toFixed(1)}%
                {panel.isJoint && ' · joint panel'}
              </p>
            ))}
            {bd.ledDetail && (
              <p className="tabular-nums">
                <span className="font-medium text-gray-700">Lighting</span>
                {' '}cove {item.lightDepth}" · strip gap {item.ledSpacingMM ?? 125} mm · {bd.ledDetail.totalRunningMeters} m running
                {driverItems.length > 0 && ` · ${driverItems.map(l => `${l.qty} × ${l.description.replace(/ \[.*\]/, '')}`).join(', ')}`}
              </p>
            )}
          </div>
        </dl>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Dealer rate</th>
              <th className="num">Dealer amount</th>
              <th className="num">Sell rate</th>
              <th className="num">Sell amount</th>
            </tr>
          </thead>
          <tbody>
            {bd.lineItems.map((line, i) => (
              <tr key={i}>
                <td className="text-gray-800">{line.description}</td>
                <td className="num">{line.qty}</td>
                <td className="text-xs text-gray-500">{line.unit}</td>
                <td className="num text-gray-500">₹{line.dealerRate.toLocaleString('en-IN')}</td>
                <td className="num">₹{Math.round(line.dealerAmount).toLocaleString('en-IN')}</td>
                <td className="num text-gray-500">₹{line.tierRate.toLocaleString('en-IN')}</td>
                <td className="num font-medium text-gray-900">₹{Math.round(line.tierAmount).toLocaleString('en-IN')}</td>
              </tr>
            ))}
            <tr className="bg-gray-50/60">
              <td colSpan={4} className="font-medium text-gray-700">Materials subtotal{hasMultiple ? ` (× ${qty})` : ''}</td>
              <td className="num font-medium text-gray-700">{fmtINR(bd.subtotalDealer)}</td>
              <td />
              <td className="num font-medium text-gray-900">{fmtINR(bd.subtotalFinal)}</td>
            </tr>
            <tr className="bg-gray-50/60">
              <td colSpan={6} className="text-gray-700">
                Installation{hasMultiple ? ` (× ${qty})` : ''}
                <span className="ml-2 text-xs text-gray-500 tabular-nums">
                  {bd.areaM2.toFixed(2)} sqm = {(bd.areaM2 * 10.7639).toFixed(1)} sqft at ₹{installRate}/sqft
                </span>
              </td>
              <td className="num font-medium text-gray-900">{fmtINR(bd.installationCost)}</td>
            </tr>
            <tr>
              <td colSpan={6} className="font-semibold text-gray-900">Item total</td>
              <td className="num font-semibold text-gray-900">{fmtINR(bd.itemTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {item.notes && (
        <div className="table-footer h-auto py-2.5 text-gray-600">
          <span><span className="font-medium text-gray-700">Note</span> {item.notes}</span>
        </div>
      )}
    </section>
  )
}
