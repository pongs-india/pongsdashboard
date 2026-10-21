import { dbGetQuote, dbGetProjectIdForQuote } from "@/lib/db"
import { canAccessQuote } from "@/lib/session"
export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { calculateQuote, fmtINR, round2 } from '@/lib/calculations'
import QuoteHeader from '@/components/QuoteHeader'
import { fmtDateLong } from '@/lib/format'

const LIGHT_LABEL: Record<string, string> = {
  single_color: 'Single colour', single_color_dimmable: 'Single colour dimmable', tunable: 'Tunable white',
  tunable_dali: 'Tunable, DALI at site', rgb: 'RGB', rgbw: 'RGBW / NW / WW',
}

// Internal cost review: every line at the quoted rate, item by item, in the
// order the materials will be ordered. Printable for the operations team.
export default async function InternalPage({ params }: { params: { id: string } }) {
  const quote = await dbGetQuote(params.id)
  if (!quote) notFound()
  if (!(await canAccessQuote(quote.ownerEmail))) notFound()
  const projectId = await dbGetProjectIdForQuote(quote.id)

  const bd = calculateQuote(quote)
  const dateStr = fmtDateLong(quote.date)

  return (
    <div className="page">
      <QuoteHeader quote={quote} active="internal" projectId={projectId} />

      {/* Print-only heading */}
      <div className="hidden print:block mb-6">
        <p className="text-xs text-gray-500">Internal cost review · {quote.quoteNumber} · {dateStr}</p>
        <h1 className="text-xl font-semibold">{quote.clientName}</h1>
        <p className="text-sm text-gray-600">{[quote.projectName, quote.location].filter(Boolean).join(' · ')}</p>
      </div>

      <div className="space-y-4">
        {bd.itemBreakdowns.map((item, idx) => {
          const d = item.item.dimensions as unknown as Record<string, number>
          const dimStr = item.item.shape === 'circle'
            ? `Ø ${d.diameter} ${item.item.unit}`
            : `${d.dim1 ?? 0} × ${d.dim2 ?? 0} ${item.item.unit}`
          const isCustom = item.fabricDetail.panels.length === 0 && !item.ledDetail
          const sqft = round2(item.areaM2 * 10.7639)

          return (
            <section key={item.item.id} className="table-wrap break-inside-avoid">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-700 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-gray-900">{item.item.name || `Item ${idx + 1}`}</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {isCustom
                        ? `Custom line${item.item.quantity > 1 ? ` · Qty ${item.item.quantity}` : ''}`
                        : [dimStr, item.item.fabricType, LIGHT_LABEL[item.item.lightType] ?? null, item.item.quantity > 1 ? `Qty ${item.item.quantity}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {!isCustom && (
                  <div className="text-right text-xs text-gray-500 tabular-nums">
                    <p>{sqft.toFixed(2)} sqft ({item.areaM2.toFixed(2)} sqm)</p>
                    {item.item.quantity > 1 && <p>{round2(sqft * item.item.quantity).toFixed(2)} sqft for {item.item.quantity} pieces</p>}
                  </div>
                )}
              </div>

              {!isCustom && (
                <div className="space-y-1 px-5 py-3 bg-gray-50/60 border-b border-gray-200 text-xs text-gray-600 tabular-nums">
                  {item.fabricDetail.panels.map((panel, pi) => (
                    <p key={pi}>
                      <span className="font-medium text-gray-700">{item.fabricDetail.panels.length > 1 ? `Panel ${pi + 1}` : 'Fabric'}</span>
                      {' '}{panel.orientation} · billed {panel.panelArea.toFixed(2)} sqm · used {panel.usedArea.toFixed(2)} sqm · waste {panel.wastageArea.toFixed(2)} sqm ({panel.wastagePercent.toFixed(1)}%)
                    </p>
                  ))}
                  {item.ledDetail && (
                    <p>
                      <span className="font-medium text-gray-700">LED</span>
                      {' '}{item.ledDetail.stripCount} strips × {item.ledDetail.runningLengthM.toFixed(2)} m = {item.ledDetail.totalRunningMeters} m · {item.ledDetail.totalWatts} W · gap {item.item.ledSpacingMM ?? 125} mm
                    </p>
                  )}
                </div>
              )}

              <div className="table-scroll">
                <table className="table min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Description</th>
                      <th className="num">Qty</th>
                      <th>Unit</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lineItems.map((li, i) => (
                      // Line items already carry total quantities (× item quantity)
                      <tr key={i}>
                        <td className="text-xs text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="text-gray-800">{li.description}</td>
                        <td className="num">{round2(li.qty)}</td>
                        <td className="text-xs text-gray-500">{li.unit}</td>
                        <td className="num text-gray-500">{fmtINR(li.tierRate)}</td>
                        <td className="num font-medium text-gray-900">{fmtINR(round2(li.tierAmount))}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="text-xs text-gray-400 tabular-nums">{item.lineItems.length + 1}</td>
                      <td className="text-gray-800">
                        Installation
                        {item.item.quantity > 1 && <span className="ml-2 text-xs text-gray-500 tabular-nums">{sqft.toFixed(2)} × {item.item.quantity}</span>}
                      </td>
                      <td className="num">{round2(sqft * item.item.quantity).toFixed(2)}</td>
                      <td className="text-xs text-gray-500">sqft</td>
                      <td className="num text-gray-500">₹{quote.installationRatePerSqft}</td>
                      <td className="num font-medium text-gray-900">{fmtINR(item.installationCost)}</td>
                    </tr>
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="text-right font-medium text-gray-700">
                        Item subtotal{item.item.quantity > 1 ? ` (× ${item.item.quantity})` : ''}
                      </td>
                      <td className="num font-semibold text-gray-900">{fmtINR(item.itemTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>

      <section className="card mt-6 ml-auto max-w-md break-inside-avoid">
        <dl className="px-5 py-4 space-y-2.5 text-[13px]">
          <TotalRow label="Materials" value={fmtINR(bd.materialsTotalFinal)} />
          <TotalRow label="Installation" value={fmtINR(bd.totalInstallation)} />
          {bd.transportCost > 0 && <TotalRow label="Packing and transport" value={fmtINR(bd.transportCost)} />}
          <div className="border-t border-gray-100 pt-2.5">
            <TotalRow label="Subtotal before GST" value={fmtINR(bd.subtotalBeforeGst)} strong />
          </div>
          {bd.gstAmount > 0 && <TotalRow label="GST 18%" value={fmtINR(bd.gstAmount)} />}
        </dl>
        <div className="flex items-baseline justify-between border-t border-gray-200 bg-gray-50/60 px-5 py-4 rounded-b-lg">
          <span className="text-[13px] font-medium text-gray-900">Grand total</span>
          <span className="text-xl font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(bd.grandTotal)}</span>
        </div>
      </section>
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? 'font-medium text-gray-900' : 'text-gray-600'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{value}</dd>
    </div>
  )
}
