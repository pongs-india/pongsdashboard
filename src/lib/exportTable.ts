'use client'

// Downloads of a table exactly as filtered, searched and sorted on screen:
// formatted Excel, plain CSV, a print/PDF view, or the rows on the clipboard.
// The spreadsheet library loads on the first Excel export, so no page pays for it up front.

export type ExportKind = 'text' | 'int' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'status' | 'mono' | 'bool'
export type ExportCol = { key: string; label: string; kind?: ExportKind; total?: boolean }
type Row = Record<string, unknown>
export type ExportInput = { title: string; cols: ExportCol[]; rows: Row[]; note?: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NUMERIC = new Set<ExportKind>(['int', 'number', 'money', 'percent'])
export const isNumberCol = (c: { kind?: ExportKind }) => !!c.kind && NUMERIC.has(c.kind)

const plain = (v: unknown) => (v === null || v === undefined || (typeof v === 'object' && !(v instanceof Date)) ? null : v)
const toNumber = (v: unknown) => { const n = Number(String(v).replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : null }

function toDate(v: unknown, withTime: boolean): Date | null {
  const s = String(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const t = new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z').getTime()
  if (Number.isNaN(t)) return null
  const d = new Date(t + 5.5 * 3600 * 1000) // India time
  return withTime ? d : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const pad = (n: number) => String(n).padStart(2, '0')
const dateText = (d: Date, withTime: boolean) =>
  `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}${withTime ? `, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : ''}`

/** One value as a spreadsheet should hold it: numbers as numbers, dates as dates. */
export function exportValue(c: ExportCol, v: unknown): string | number | Date | null {
  const x = plain(v)
  if (x === null || x === '') return null
  if (isNumberCol(c)) { const n = toNumber(x); return n === null ? null : Math.round(n * 100) / 100 }
  if (c.kind === 'date' || c.kind === 'datetime') return toDate(x, c.kind === 'datetime') ?? String(x)
  if (c.kind === 'bool') return x ? 'Yes' : 'No'
  if (c.kind === 'status') return String(x).replace(/[_-]+/g, ' ').replace(/^\w/, ch => ch.toUpperCase())
  return String(x)
}

const label = (c: ExportCol) => (c.kind === 'money' && !/₹|inr/i.test(c.label) ? `${c.label} (₹)` : c.kind === 'percent' && !/%/.test(c.label) ? `${c.label} (%)` : c.label)

function totalsOf(cols: ExportCol[], rows: Row[]) {
  return new Map(cols.filter(c => c.total && isNumberCol(c)).map(c => [c.key, Math.round(rows.reduce((s, r) => s + (toNumber(plain(r[c.key])) ?? 0), 0) * 100) / 100]))
}

function fileName(title: string, ext: string) {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'
  return `pongs-${slug}-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}.${ext}`
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// Text that a spreadsheet would run as a formula is prefixed so it stays text.
const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s)

/** CSV with a UTF-8 BOM (so Excel shows ₹ and Indian names correctly) and a Total line. */
export function downloadCsv({ title, cols, rows }: ExportInput) {
  const totals = totalsOf(cols, rows)
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const fmt = (c: ExportCol, v: unknown) => {
    const x = exportValue(c, v)
    if (x === null) return ''
    if (x instanceof Date) return dateText(x, c.kind === 'datetime')
    if (typeof x === 'number') return c.kind === 'money' ? x.toFixed(2) : String(x)
    return safeText(x)
  }
  const lines = [cols.map(c => esc(label(c))).join(',')]
    .concat(rows.map(r => cols.map(c => esc(fmt(c, r[c.key]))).join(',')))
  if (totals.size) lines.push(cols.map((c, i) => esc(totals.has(c.key) ? fmt(c, totals.get(c.key)) : i === 0 ? 'Total' : '')).join(','))
  save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName(title, 'csv'))
}

/** Excel workbook: title and generated line, bold dark header with filters and a frozen top,
 *  hairline borders and banding, numbers and dates as real values, and a Total row. */
export async function downloadXlsx({ title, cols, rows, note }: ExportInput) {
  const totals = totalsOf(cols, rows)
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pongs India'
  wb.created = new Date()
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1', { views: [{ state: 'frozen', ySplit: 4 }] })
  const n = Math.max(1, cols.length)
  const grey = { argb: 'FFD5D9E0' }, dark = { argb: 'FF111827' }
  const thin = { style: 'thin' as const, color: grey }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  ws.mergeCells(1, 1, 1, n)
  Object.assign(ws.getCell(1, 1), { value: title, font: { name: 'Calibri', size: 14, bold: true, color: dark } })
  ws.mergeCells(2, 1, 2, n)
  const now = new Date(Date.now() + 5.5 * 3600 * 1000)
  Object.assign(ws.getCell(2, 1), {
    value: `Pongs India · Generated ${dateText(now, true)} IST · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${note ? ` · ${note}` : ''}`,
    font: { size: 9, color: { argb: 'FF646B78' } },
  })

  const head = ws.getRow(4)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = label(c)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } }
    cell.alignment = { vertical: 'middle', horizontal: isNumberCol(c) ? 'right' : 'left', wrapText: true }
    cell.border = border
  })
  head.height = 22

  const numFmt = (c: ExportCol) => c.kind === 'money' ? '"₹ "#,##,##0.00' : c.kind === 'int' ? '#,##0' : c.kind === 'number' ? '#,##0.##' : c.kind === 'percent' ? '0.0' : c.kind === 'date' ? 'dd mmm yyyy' : c.kind === 'datetime' ? 'dd mmm yyyy hh:mm' : undefined
  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri)
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      const v = exportValue(c, r[c.key])
      cell.value = (typeof v === 'string' ? safeText(v) : v) as never
      const f = numFmt(c); if (f) cell.numFmt = f
      cell.font = { color: dark }
      cell.border = border
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
      if (isNumberCol(c)) cell.alignment = { horizontal: 'right' }
    })
  })
  if (totals.size) {
    const row = ws.getRow(5 + rows.length)
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = totals.has(c.key) ? totals.get(c.key)! : i === 0 ? 'Total' : null
      const f = numFmt(c); if (f && totals.has(c.key)) cell.numFmt = f
      cell.font = { bold: true, color: dark }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F3' } }
      cell.border = { ...border, top: { style: 'medium', color: dark } }
      if (isNumberCol(c)) cell.alignment = { horizontal: 'right' }
    })
  }
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: n } }
  cols.forEach((c, i) => {
    const len = (v: unknown) => { const x = exportValue(c, v); return x === null ? 0 : x instanceof Date ? 12 : typeof x === 'number' ? String(Math.round(x)).length + 5 : String(x).length }
    const widest = Math.max(label(c).length, ...rows.slice(0, 2000).map(r => len(r[c.key])))
    ws.getColumn(i + 1).width = Math.min(48, Math.max(9, widest + 2))
  })
  ws.pageSetup = { orientation: n > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' }
  const buf = await wb.xlsx.writeBuffer()
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(title, 'xlsx'))
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const display = (c: ExportCol, v: unknown) => {
  const x = exportValue(c, v)
  if (x === null) return ''
  if (x instanceof Date) return dateText(x, c.kind === 'datetime')
  if (typeof x === 'number') return c.kind === 'money' ? `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : x.toLocaleString('en-IN')
  return x
}

/** A clean A4 page of the table in a new window, opened on the print dialog
 *  (Save as PDF or send to a printer). */
export function printTable({ title, cols, rows, note }: ExportInput) {
  const totals = totalsOf(cols, rows)
  const now = new Date(Date.now() + 5.5 * 3600 * 1000)
  const th = cols.map(c => `<th class="${isNumberCol(c) ? 'r' : ''}">${escHtml(label(c))}</th>`).join('')
  const body = rows.map(r => `<tr>${cols.map(c => `<td class="${isNumberCol(c) ? 'r' : ''}">${escHtml(String(display(c, r[c.key])))}</td>`).join('')}</tr>`).join('')
  const foot = totals.size ? `<tfoot><tr>${cols.map((c, i) => `<td class="${isNumberCol(c) ? 'r' : ''}">${totals.has(c.key) ? escHtml(String(display(c, totals.get(c.key)))) : i === 0 ? 'Total' : ''}</td>`).join('')}</tr></tfoot>` : ''
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    @page { size: A4 ${cols.length > 7 ? 'landscape' : 'portrait'}; margin: 12mm; }
    body { font: 11px/1.4 -apple-system, 'Segoe UI', Inter, Arial, sans-serif; color: #111827; margin: 0; }
    h1 { font-size: 16px; margin: 0 0 2px; } .meta { color: #646b78; font-size: 10px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th { background: #f3f4f6; text-align: left; font-weight: 600; }
    th, td { border: 1px solid #d5d9e0; padding: 4px 6px; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #fafafa; } tfoot td { font-weight: 700; background: #eef0f3; }
    .r { text-align: right; } thead { display: table-header-group; } tr { page-break-inside: avoid; }
  </style></head><body><h1>${escHtml(title)}</h1><div class="meta">Pongs India · ${dateText(now, true)} IST · ${rows.length} rows${note ? ` · ${escHtml(note)}` : ''}</div>
  <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot}</table>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 150) })<\/script></body></html>`
  const w = window.open('', '_blank', 'noopener=no,width=1100,height=800')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}

/** Tab-separated rows on the clipboard: pastes straight into Excel or Google Sheets as cells. */
export async function copyRows({ cols, rows }: ExportInput) {
  const fmt = (c: ExportCol, v: unknown) => { const x = exportValue(c, v); return x === null ? '' : x instanceof Date ? dateText(x, c.kind === 'datetime') : String(x).replace(/[\t\n\r]+/g, ' ') }
  const text = [cols.map(label).join('\t'), ...rows.map(r => cols.map(c => fmt(c, r[c.key])).join('\t'))].join('\n')
  await navigator.clipboard.writeText(text)
}
