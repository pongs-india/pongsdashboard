import { dbGetQuote, dbGetProjectIdForQuote } from "@/lib/db"
import { canAccessQuote } from "@/lib/session"
export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { calculateQuote, fmtINR, formatDims, round2 } from '@/lib/calculations'
const SQFT_PER_SQM = 10.7639
import QuoteHeader from '@/components/QuoteHeader'
import SharePDF from '@/components/SharePDF'

import { getCompany } from '@/lib/companies'
import { fmtDateLong } from '@/lib/format'

const HSN_CEILING = '3921'

function articleNo(idx: number) {
  return `SCS-${String(idx + 1).padStart(3, '0')}`
}

const lightLabel: Record<string, string> = {
  single_color:           'Single Colour LED Cove',
  single_color_dimmable:  'Single Colour LED Cove (Dimmable)',
  tunable:                'Tunable White LED Cove',
  tunable_dali:           'Tunable White LED Cove (DALI)',
  rgb:                    'RGB LED Cove',
  rgbw:                   'RGBW LED Cove',
}

export default async function ClientPage({ params }: { params: { id: string } }) {
  const quote = await dbGetQuote(params.id)
  if (!quote) notFound()
  if (!(await canAccessQuote(quote.ownerEmail))) notFound()

  const projectId = await dbGetProjectIdForQuote(quote.id)

  // Company branding for this quotation (STC / NLS / future companies)
  const co = getCompany(quote.company)

  const bd = calculateQuote(quote)
  const isCustom = quote.priceTier === 'manual_custom'

  const dateStr = fmtDateLong(quote.date)
  const validStr = quote.validUntil
    ? fmtDateLong(quote.validUntil)
    : null

  const hasLighting = quote.items.some(i => i.lightType !== 'none')
  const hasGripper  = quote.items.length > 0
  const hasPrinting = quote.items.some(i => i.withPrinting)

  const waMessage = encodeURIComponent(
    `*${co.name} – Quotation*\n\n` +
    `*Quote:* ${quote.quoteNumber}\n*Client:* ${quote.clientName}\n` +
    `*Project:* ${quote.projectName || '—'}\n*Date:* ${dateStr}\n\n` +
    `*Grand Total: ${fmtINR(bd.grandTotal)}*${quote.includeGst ? ' (Incl. GST)' : ' (Excl. GST)'}\n\n` +
    `_${co.name}_`
  )
  const waUrl = `https://wa.me/${quote.clientPhone ? quote.clientPhone.replace(/\D/g, '') : ''}?text=${waMessage}`
  const mailUrl = `mailto:${quote.clientEmail ?? ''}?subject=Quotation ${quote.quoteNumber} – ${co.name}&body=${encodeURIComponent(`Dear ${quote.clientName},\n\nPlease find attached our quotation ${quote.quoteNumber} for ${quote.projectName || 'your project'}.\n\nGrand Total: ${fmtINR(bd.grandTotal)}${quote.includeGst ? ' (Incl. GST)' : ' (Excl. GST)'}\n\nValid until: ${validStr ?? '30 days from date'}\n\nBest regards,\n${co.name}`)}`

  const tcPoints = [
    'Order: Once placed cannot be modified, exchanged or cancelled.',
    `Validity: This quotation is valid for 30 days${validStr ? ` (until ${validStr})` : ''}, subject to availability of material at the time of placing the order.`,
    'Due to the customised nature of the product, 100% downpayment is required along with the confirmed Purchase Order.',
    `NEFT / RTGS to be made in the name of: ${co.bank?.accountName ?? co.name}.`,
    'Electrical point to be provided nearest to the area where ceiling installation work is to be done.',
    'Delivery within 10 to 12 working days from confirmed PO and payment receipt.',
    'No measurement changes will be entertained once installation is complete.',
    'Any additional LED, Grippers, Woodwork, Wires or Drivers used will be charged over and above this quotation.',
    'Removing and re-fixing of installed fabric will be charged extra.',
    'Client to provide plywood box with white paint / white laminate and supporting structure in all areas where fabric is to be installed.',
    'A-Type ladder or scaffolding / staging to be arranged at site by the client.',
    'All rates quoted are highly competitive. We look forward to the opportunity to work with you.',
  ]

  const whyPoints = [
    { icon: 'LED', label: 'Integrated LED\n& Lighting Systems' },
    { icon: 'GER', label: 'German Innovation,\nIndian Execution' },
    { icon: 'EXE', label: 'In-House Execution\n& Support' },
    { icon: 'EXP', label: 'Proven\nExpertise' },
    { icon: 'PRT', label: 'DURST Printing\nCollaboration' },
    { icon: 'SUS', label: 'Sustainable\nby Design' },
    { icon: 'ACO', label: 'Seamless Acoustic\nPerformance' },
    { icon: 'DLV', label: 'Fast Delivery &\nSmart Execution' },
    { icon: 'NAT', label: 'Nation-wide\nExperience Centres' },
  ]

  const CX = 280, CY = 270, CR = 200
  const circleItems = whyPoints.map((p, i) => {
    const deg = i * 40 - 90
    const rad = (deg * Math.PI) / 180
    return { ...p, x: CX + CR * Math.cos(rad), y: CY + CR * Math.sin(rad), deg }
  })

  return (
    <div>
      <QuoteHeader quote={quote} active="client" projectId={projectId} printable={false} />

      {/* ── Share bar (screen only) ── */}
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-gray-500">
          Preview of the document sent to the client, issued by <span className="font-medium text-gray-700">{co.name}</span>.
        </p>
        <SharePDF quoteNumber={quote.quoteNumber} clientName={quote.clientName} waUrl={waUrl} mailUrl={mailUrl} />
      </div>

      {/* ── PDF Pages ── */}
      <div className="pdf-mobile-outer -mx-4 sm:mx-0 rounded-lg bg-gray-100 border border-gray-200 py-8 px-4 sm:px-8 print:overflow-visible print:mx-0 print:p-0 print:border-0 print:bg-white">
      <div id="quote-printable" className="print:w-full" style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>

        {/* ══════════════════════════════
            PAGE 1 — COVER
        ══════════════════════════════ */}
        <div className="quote-pdf-page relative overflow-hidden print:shadow-none"
          style={{ minHeight: '1123px', backgroundColor: '#0C0C0C', display: 'flex', flexDirection: 'column' }}>

          {/* Full-bleed cover image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cover-bg.jpg"
            alt=""
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
            }}
          />
          {/* Dark overlay so text is always readable */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.35) 100%)',
          }} />

          {/* Content — above overlay */}
          {/* flex: 1 (not height: 100%) so the column fills the min-height page and the spacer pushes the client block down */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 52px 40px' }}>

            {/* Top bar: the cover photo already carries the "Quotation" title, so only the company mark sits here */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '20px', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>{co.logoText}</p>
                <p style={{ fontSize: '7px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.25em', marginTop: '3px' }}>{co.tagline?.toUpperCase()}</p>
              </div>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Client block */}
            <div>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.2em', fontWeight: 600, textTransform: 'uppercase', marginBottom: '12px' }}>
                Prepared For
              </p>
              <p style={{ fontSize: '38px', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
                {quote.clientName}
              </p>
              {quote.projectName && (
                <p style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>
                  {quote.projectName}
                </p>
              )}
              {quote.location && (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                  {quote.location}
                </p>
              )}

              {/* Thin rule */}
              <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.12)', margin: '28px 0' }} />

              {/* Meta row */}
              <div style={{ display: 'flex', gap: '0' }}>
                {[
                  { label: 'Quote No.', value: quote.quoteNumber },
                  { label: 'Date', value: dateStr },
                  ...(validStr ? [{ label: 'Valid Until', value: validStr }] : []),
                ].map((item, i, arr) => (
                  <div key={i} style={{
                    paddingRight: i < arr.length - 1 ? '36px' : 0,
                    paddingLeft: i > 0 ? '36px' : 0,
                    borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                  }}>
                    <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '5px', fontWeight: 600 }}>
                      {item.label}
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Grand total */}
              <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', fontWeight: 600, textTransform: 'uppercase' }}>
                  Grand Total
                </p>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '26px', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {fmtINR(bd.grandTotal)}
                  </p>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>
                    {quote.includeGst ? 'Inclusive of GST 18%' : 'Exclusive of GST'}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            {/* Footer: left-aligned so it clears the Pongs mark printed bottom-right on the cover photo */}
            <div style={{ marginTop: '72px', maxWidth: '520px' }}>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', fontWeight: 600 }}>
                {co.name.toUpperCase()}
              </p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginTop: '3px' }}>
                {co.address} · {co.city}
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════
            PAGE 2+3 — QUOTE + T&C
        ══════════════════════════════ */}
        <div className="quote-pdf-page bg-white print:shadow-none" style={{ marginTop: 0 }}>

          {/* Page header */}
          <div style={{ backgroundColor: '#111', padding: '14px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', fontWeight: 600 }}>
              {co.name.toUpperCase()} &nbsp;·&nbsp; Stretch Ceiling Systems &nbsp;·&nbsp; {co.city.split(',')[0]}
            </p>
            <div>
              <span style={{ fontSize: '15px', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>{co.logoText}</span>
            </div>
          </div>

          <div style={{ padding: '28px 48px' }}>

            {/* ── Client + Quote info grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

              <div style={{ border: '1px solid #E8E8E8', borderRadius: '6px', padding: '14px 16px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>Client Details</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>{quote.clientName}</p>
                {quote.clientPhone && <p style={{ fontSize: '11px', color: '#555', marginBottom: '2px' }}>{quote.clientPhone}</p>}
                {quote.clientEmail && <p style={{ fontSize: '11px', color: '#555', marginBottom: '2px' }}>{quote.clientEmail}</p>}
                {quote.location   && <p style={{ fontSize: '11px', color: '#777', marginTop: '6px', lineHeight: 1.5 }}>{quote.location}</p>}
              </div>

              <div style={{ border: '1px solid #E8E8E8', borderRadius: '6px', padding: '14px 16px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>Quotation Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    ['Quotation No.', quote.quoteNumber],
                    ['Date', dateStr],
                    ...(validStr ? [['Valid Until', validStr]] : []),
                    ['Company', co.name],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p style={{ fontSize: '9px', color: '#999', marginBottom: '2px' }}>{label}</p>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#111' }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Table heading ── */}
            <div style={{ backgroundColor: '#111', padding: '10px 14px', borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.08em' }}>PONGS DESCOR SYSTEMS</p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>STRETCH CEILING</p>
            </div>

            {/* ── Quotation table ── */}
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E0E0E0', backgroundColor: '#F8F8F8' }}>
                  {[
                    { h: 'Article No.', align: 'left' as const },
                    { h: 'Description', align: 'left' as const },
                    { h: 'HSN', align: 'center' as const },
                    { h: quote.displayMode === 'per-sqft' ? 'Area (sqft)' : 'Qty', align: 'right' as const },
                    { h: quote.displayMode === 'per-sqft' ? '₹ / sqft' : 'Unit Price', align: 'right' as const },
                    { h: 'Amount', align: 'right' as const },
                  ].map(({ h, align }) => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: align, fontSize: '9px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bd.itemBreakdowns.map((itemBd, idx) => {
                  const item = itemBd.item
                  const isSqft = quote.displayMode === 'per-sqft'
                  // unit price = full cost for 1 unit (materials + installation)
                  const unitPrice = round2(itemBd.itemTotal / item.quantity)
                  const totalAmount = itemBd.itemTotal
                  // sqft display
                  const totalSqft = round2(itemBd.areaM2 * SQFT_PER_SQM * item.quantity)
                  const pricePerSqft = totalSqft > 0 ? round2(totalAmount / totalSqft) : 0
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F0F0F0', backgroundColor: idx % 2 === 1 ? '#FAFAFA' : 'white' }}>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', color: '#888', fontWeight: 600, fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {articleNo(idx)}
                      </td>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', maxWidth: '260px' }}>
                        <p style={{ fontWeight: 700, color: '#111', marginBottom: '3px', lineHeight: 1.3, fontSize: '11px' }}>
                          {item.name || (isCustom ? 'Item' : 'Stretch Ceiling System')}
                        </p>
                        {!isCustom && (
                          <p style={{ color: '#888', fontSize: '10px', lineHeight: 1.5 }}>
                            {item.fabricType} &nbsp;·&nbsp; {formatDims(item)}
                          </p>
                        )}
                        {!isCustom && item.lightType !== 'none' && (
                          <p style={{ color: '#888', fontSize: '10px' }}>
                            {lightLabel[item.lightType] ?? 'LED Cove'}{item.lightDepth ? ` · ${item.lightDepth}" cove depth` : ''}
                          </p>
                        )}
                        {!isCustom && item.withPrinting && <p style={{ color: '#888', fontSize: '10px' }}>Custom digital printing</p>}
                        {!isCustom && item.withFleece   && <p style={{ color: '#888', fontSize: '10px' }}>Felt pad / fleece backing</p>}
                        {item.notes        && <p style={{ color: '#bbb', fontSize: '10px', fontStyle: 'italic', marginTop: '2px' }}>{item.notes}</p>}
                      </td>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', textAlign: 'center', color: '#888', fontSize: '10px' }}>{HSN_CEILING}</td>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', textAlign: 'right', color: '#111', fontWeight: 600 }}>
                        {isSqft ? `${totalSqft.toFixed(1)}` : item.quantity}
                      </td>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>
                        {isSqft ? fmtINR(pricePerSqft) : fmtINR(unitPrice)}
                      </td>
                      <td style={{ padding: '11px 10px', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>{fmtINR(totalAmount)}</td>
                    </tr>
                  )
                })}

                {bd.transportCost > 0 && (
                  <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                    <td style={{ padding: '11px 10px', color: '#888', fontSize: '10px' }}>{articleNo(bd.itemBreakdowns.length)}</td>
                    <td style={{ padding: '11px 10px' }}>
                      <p style={{ fontWeight: 700, color: '#111' }}>Transport &amp; Logistics</p>
                      <p style={{ color: '#888', fontSize: '10px' }}>Delivery to site</p>
                    </td>
                    <td style={{ padding: '11px 10px', textAlign: 'center', color: '#888', fontSize: '10px' }}>9965</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: '#555' }}>1</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>{fmtINR(bd.transportCost)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>{fmtINR(bd.transportCost)}</td>
                  </tr>
                )}

                {bd.gstAmount > 0 && (
                  <>
                    <tr>
                      <td colSpan={4} />
                      <td style={{ padding: '8px 10px 3px', textAlign: 'right', fontSize: '11px', color: '#777', borderTop: '1px solid #E8E8E8' }}>Subtotal</td>
                      <td style={{ padding: '8px 10px 3px', textAlign: 'right', fontWeight: 600, color: '#111', whiteSpace: 'nowrap', borderTop: '1px solid #E8E8E8' }}>{fmtINR(bd.subtotalBeforeGst)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td style={{ padding: '3px 10px 8px', textAlign: 'right', fontSize: '11px', color: '#777' }}>GST 18%</td>
                      <td style={{ padding: '3px 10px 8px', textAlign: 'right', fontWeight: 600, color: '#111', whiteSpace: 'nowrap' }}>{fmtINR(bd.gstAmount)}</td>
                    </tr>
                  </>
                )}

                {/* Grand total */}
                <tr style={{ backgroundColor: '#111' }}>
                  <td colSpan={4} style={{ padding: '14px 10px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', letterSpacing: '0.18em', fontWeight: 700 }}>GRAND TOTAL</p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginTop: '3px' }}>
                      {quote.includeGst ? 'Inclusive of GST 18%' : 'Exclusive of GST'}
                    </p>
                  </td>
                  <td style={{ padding: '14px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.45)', fontSize: '10px', fontWeight: 600 }}>Total</td>
                  <td style={{ padding: '14px 10px', textAlign: 'right', fontSize: '20px', fontWeight: 900, color: 'white', whiteSpace: 'nowrap' }}>
                    {fmtINR(bd.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>

            {quote.displayMode === 'per-sqft' && bd.totalSqft > 0 && (
              <p style={{ textAlign: 'right', fontSize: '10px', color: '#aaa', marginTop: '5px' }}>
                Total: {bd.totalSqft.toFixed(1)} sqft &nbsp;·&nbsp; Avg {fmtINR(bd.pricePerSqft)}/sqft
              </p>
            )}

            {/* Scope */}
            <div style={{ marginTop: '20px', padding: '12px 16px', backgroundColor: '#F8F8F8', borderRadius: '5px', borderLeft: '3px solid #111' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#111', letterSpacing: '0.12em', marginBottom: '5px', textTransform: 'uppercase' }}>Scope of Supply &amp; Work</p>
              <p style={{ fontSize: '10px', color: '#555', lineHeight: 1.65 }}>
                Premium PONGS / Descor stretch ceiling fabric
                {hasGripper ? ', aluminium gripper profiles' : ''}
                {hasLighting ? ', integrated LED cove lighting with drivers, controllers and remotes' : ''}
                {hasPrinting ? ', custom digital printing on fabric' : ''}
                , and professional installation by certified technicians.
              </p>
            </div>

            {/* Notes */}
            {quote.notes && (
              <div style={{ marginTop: '12px', padding: '12px 16px', backgroundColor: '#F8F8F8', borderRadius: '5px', borderLeft: '3px solid #111' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#111', letterSpacing: '0.12em', marginBottom: '5px', textTransform: 'uppercase' }}>Special Notes</p>
                <p style={{ fontSize: '10px', color: '#555', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{quote.notes}</p>
              </div>
            )}

            {/* T&C */}
            <div style={{ marginTop: '20px', border: '1px solid #E0E0E0', borderRadius: '5px', padding: '16px 18px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#111', marginBottom: '10px', letterSpacing: '0.05em' }}>Terms &amp; Conditions</p>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {tcPoints.map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '9.5px', color: '#555', lineHeight: 1.55, marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, flexShrink: 0, color: '#111', minWidth: '14px' }}>{i + 1}.</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Banking */}
            <div style={{ marginTop: '12px', border: '1px solid #E0E0E0', borderRadius: '5px', padding: '16px 18px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#111', marginBottom: '10px', letterSpacing: '0.05em' }}>Banking Details</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                {[
                  ['Bank Name', co.bank?.name ?? '—'],
                  ['Account Name', co.bank?.accountName ?? co.name],
                  ['Account Number', co.bank?.accountNumber ?? '—'],
                  ['IFSC Code', co.bank?.ifsc ?? '—'],
                  ...(co.gstin ? [['GSTIN', co.gstin]] : []),
                ].map(([label, value]) => (
                  <p key={label} style={{ fontSize: '10px', color: '#555' }}>
                    <span style={{ fontWeight: 700, color: '#111' }}>{label}: </span>{value}
                  </p>
                ))}
              </div>
            </div>

            {/* Signature */}
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'center', minWidth: '180px' }}>
                <div style={{ height: '44px', borderBottom: '1px solid #111', marginBottom: '8px' }} />
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#111' }}>Authority Signature</p>
                <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{co.name}</p>
              </div>
            </div>

          </div>
        </div>

        {/* ══════════════════════════════
            PAGE 4 — WHY CHOOSE PONGS
        ══════════════════════════════ */}
        <div className="quote-pdf-page print:shadow-none" style={{ backgroundColor: '#F5F4F2', minHeight: '1123px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Use the original Pongs "Why Choose" graphic as full page */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/why-pongs.jpg"
            alt="Why Choose PONGS?"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block', flex: 1 }}
          />
          {/* Footer strip */}
          <div style={{
            padding: '14px 60px',
            borderTop: '1px solid #D0CEC8',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#F5F4F2',
          }}>
            <div>
              <p style={{ fontSize: '10px', color: '#888' }}>{co.name} &nbsp;·&nbsp; {co.city}</p>
              <p style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{co.email} · {co.phone}</p>
            </div>
            <p style={{ fontSize: '9px', color: '#aaa', letterSpacing: '0.1em' }}>{quote.quoteNumber}</p>
          </div>
        </div>

      </div>
      </div>
    </div>
  )
}
