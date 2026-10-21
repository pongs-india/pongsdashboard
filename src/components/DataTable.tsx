'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown,
  ClipboardCopy, Download, ExternalLink, FileSpreadsheet, FileText, Pencil, Printer, Search, Trash2, RotateCcw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Select } from '@/components/controls'
import { EmptyState, StatusBadge, humanize } from '@/components/ui'
import { toast } from '@/components/feedback'
import { fmtINR, fmtDate } from '@/lib/format'
import { navigate } from '@/lib/navigate'
import { copyRows, downloadCsv, downloadXlsx, isNumberCol, printTable, type ExportCol, type ExportKind } from '@/lib/exportTable'

// One table for every list in the product. Search, sort, typed cells, totals,
// page size, and downloads (Excel, CSV, print/PDF, copy) that follow exactly
// what is on screen: filters, search and sort, every page of rows.

type Row = Record<string, unknown>

export type Col = {
  key: string
  label: string
  kind?: ExportKind
  align?: 'left' | 'right' | 'center'
  /** Sum this column in the footer and in exports. */
  total?: boolean
  /** Custom cell. The plain value (row[key] or sortValue) still drives search, sort and export. */
  render?: (row: Row) => ReactNode
  /** Value used for sorting and export when it differs from row[key]. */
  value?: (row: Row) => string | number | null | undefined
  /** A second, quieter line under the value (client under project). Searched and exported as its own column. */
  sub?: { key: string; label: string; mono?: boolean }
  /** Label map for kind "status" (e.g. in_progress → In progress). */
  labels?: Record<string, string>
  /** Hide the column below this breakpoint (it is still exported). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  /** Leave the column out of exports (action-like cells). */
  noExport?: boolean
  /** Don't make the header sortable. */
  noSort?: boolean
  className?: string
}

export type RowAction = { icon: 'open' | 'edit' | 'print' | 'restore' | 'trash'; label: string; onClick?: () => void; href?: string; tone?: 'danger'; disabled?: boolean }
const ACTION_ICON: Record<RowAction['icon'], LucideIcon> = { open: ExternalLink, edit: Pencil, print: Printer, restore: RotateCcw, trash: Trash2 }
// The same icons in the same order on every table: open, edit, print, restore, delete.
const ACTION_ORDER = ['open', 'edit', 'print', 'restore', 'trash']

const HIDE: Record<NonNullable<Col['hideBelow']>, string> = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }

function plainOf(c: Col, r: Row): unknown {
  return c.value ? c.value(r) : r[c.key]
}

function Cell({ c, r }: { c: Col; r: Row }) {
  if (c.render) return <>{c.render(r)}</>
  const v = plainOf(c, r)
  if (v === null || v === undefined || v === '') return <span className="text-faint">—</span>
  switch (c.kind) {
    case 'money': return <>{fmtINR(Number(v))}</>
    case 'int': return <>{Number(v).toLocaleString('en-IN')}</>
    case 'number': return <>{Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>
    case 'percent': return <>{Math.round(Number(v))}%</>
    case 'date': return <>{fmtDate(String(v))}</>
    case 'datetime': return <>{fmtDateTime(String(v))}</>
    case 'status': return <StatusBadge status={String(v)} label={c.labels?.[String(v)] ?? humanize(String(v))} />
    case 'bool': return v ? <>Yes</> : <span className="text-faint">No</span>
    case 'mono': return <span className="font-mono text-[12px]">{String(v)}</span>
    default: return <>{String(v)}</>
  }
}

export function fmtDateTime(s: string) {
  const d = new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' })

export function DataTable({
  title, cols, rows, rowKey = 'id', exportTitle, pageSize = 25, loading, error, onRetry,
  toolbar, actions, filters, filtersActive, onClearFilters, empty, rowHref, onRowClick, rowActions,
  initialSort, searchPlaceholder = 'Search', hideSearch, summary, embedded, bare, note, rowClass,
}: {
  title?: string
  cols: Col[]
  rows: Row[]
  rowKey?: string
  /** Name of the downloaded file and printout when it should differ from the title. */
  exportTitle?: string
  pageSize?: number
  loading?: boolean
  error?: string
  onRetry?: () => void
  /** Extra controls in the header, before search. */
  toolbar?: ReactNode
  /** The view's one primary action, last in the header. */
  actions?: ReactNode
  /** Filter controls, shown as a band under the header. */
  filters?: ReactNode
  filtersActive?: boolean
  onClearFilters?: () => void
  empty?: { title?: string; description?: ReactNode; action?: ReactNode; icon?: LucideIcon }
  rowHref?: (row: Row) => string
  onRowClick?: (row: Row) => void
  rowActions?: (row: Row) => RowAction[]
  initialSort?: { key: string; dir: 1 | -1 }
  searchPlaceholder?: string
  hideSearch?: boolean
  /** Right side of the pager row (e.g. "Outstanding ₹4,20,000"). Receives the rows after search. */
  summary?: (visible: Row[]) => ReactNode
  /** Inside another card: no frame and no header (the host card has the title). */
  embedded?: boolean
  /** Hide the export menu (small tables). */
  bare?: boolean
  /** Added to exports and printouts, e.g. the active filters. */
  note?: string
  rowClass?: (row: Row) => string
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null)
  const [size, setSize] = useState(pageSize)
  const [page, setPage] = useState(0)

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => cols.some(c => String(plainOf(c, r) ?? '').toLowerCase().includes(needle) || (c.sub && String(r[c.sub.key] ?? '').toLowerCase().includes(needle))))
  }, [rows, cols, q])

  const sorted = useMemo(() => {
    if (!sort) return searched
    const c = cols.find(x => x.key === sort.key)
    if (!c) return searched
    const blank = (v: unknown) => v === null || v === undefined || v === ''
    return [...searched].sort((a, b) => {
      const x = plainOf(c, a), y = plainOf(c, b)
      // Blanks always sink to the bottom, whichever way the column sorts.
      if (blank(x) && blank(y)) return 0
      if (blank(x)) return 1
      if (blank(y)) return -1
      const n = isNumberCol(c) || (typeof x === 'number' && typeof y === 'number') ? Number(x) - Number(y) : collator.compare(String(x), String(y))
      return n * sort.dir
    })
  }, [searched, sort, cols])

  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const cur = Math.min(page, pages - 1)
  const visible = sorted.slice(cur * size, cur * size + size)
  useEffect(() => { setPage(0) }, [rows, q])

  const totals = useMemo(() => Object.fromEntries(cols.filter(c => c.total).map(c => [c.key, sorted.reduce((s, r) => s + (Number(plainOf(c, r)) || 0), 0)])), [cols, sorted])
  const hasTotals = Object.keys(totals).length > 0
  const align = (c: Col) => c.align ?? (isNumberCol(c) ? 'right' : 'left')
  const ta = (c: Col) => ({ left: 'text-left', right: 'text-right tabular-nums', center: 'text-center' })[align(c)]
  const clickable = !!(rowHref || onRowClick)

  const exportCols: ExportCol[] = cols.filter(c => !c.noExport).flatMap(c => {
    const base: ExportCol = { key: c.key, label: c.label, kind: c.kind, total: c.total }
    return c.sub ? [base, { key: c.sub.key, label: c.sub.label }] : [base]
  })
  const exportInput = () => {
    const noteParts = [note, q.trim() ? `Search: ${q.trim()}` : ''].filter(Boolean)
    return {
      title: exportTitle ?? title ?? 'Export',
      cols: exportCols,
      // Custom cells export their plain value.
      rows: sorted.map(r => Object.fromEntries(cols.filter(c => !c.noExport).flatMap(c => {
        const pairs: [string, unknown][] = [[c.key, plainOf(c, r)]]
        if (c.sub) pairs.push([c.sub.key, r[c.sub.key]])
        return pairs
      }))),
      note: noteParts.join(' · ') || undefined,
    }
  }

  const colCount = cols.length + (rowActions ? 1 : 0)

  const open = (r: Row, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,a,input,[role=menu]')) return
    if (rowHref) navigate(rowHref(r), e)
    else onRowClick?.(r)
  }

  const header = !embedded && (
    <div className="no-print card-head">
      <div className="flex min-w-[10rem] flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {title && <h2 className="card-title min-w-0 break-words">{title}</h2>}
        {!loading && !error && <span className="count shrink-0">{sorted.length.toLocaleString('en-IN')} {sorted.length === 1 ? 'row' : 'rows'}</span>}
      </div>
      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {toolbar}
        {!hideSearch && (
          <div className="relative order-last w-full sm:order-none sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder}
              aria-label={`Search ${title ?? 'rows'}`} className="input input-sm w-full pl-8" />
          </div>
        )}
        {!bare && <ExportMenu disabled={loading || !!error || sorted.length === 0} input={exportInput} />}
        {actions}
      </div>
    </div>
  )

  return (
    <div className={embedded ? 'overflow-hidden' : 'card overflow-hidden'}>
      {header}
      {filters && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line bg-surface-alt px-4 py-2.5">
          {filters}
          {filtersActive && onClearFilters && <button type="button" className="btn-ghost btn-sm" onClick={onClearFilters}>Clear filters</button>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {cols.map(c => {
                const active = sort?.key === c.key
                const Icon = !active ? ChevronsUpDown : sort!.dir === 1 ? ArrowUp : ArrowDown
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={`${ta(c)} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className ?? ''}`}>
                    {c.noSort ? c.label : (
                      <button type="button" onClick={() => setSort(s => (s?.key !== c.key ? { key: c.key, dir: 1 } : s.dir === 1 ? { key: c.key, dir: -1 } : null))}
                        className={`group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-ink ${active ? 'text-ink' : ''} ${align(c) === 'right' ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        <Icon size={12} className={active ? 'text-ink' : 'text-line-hover opacity-0 group-hover:opacity-100'} aria-hidden />
                      </button>
                    )}
                  </th>
                )
              })}
              {rowActions && <th scope="col" className="w-px text-right no-print"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk${i}`} aria-hidden>
                {cols.map((c, j) => (
                  <td key={c.key} className={`${c.hideBelow ? HIDE[c.hideBelow] : ''}`}>
                    <div className={`skeleton h-3 ${align(c) === 'right' ? 'ml-auto' : ''}`} style={{ width: j === 0 ? '60%' : `${30 + ((i + j) % 3) * 15}%` }} />
                  </td>
                ))}
                {rowActions && <td />}
              </tr>
            ))}
            {!loading && error && (
              <tr><td colSpan={colCount} className="!h-auto !p-4">
                <div className="alert-error" role="alert"><span><span className="font-medium">{title ? `${title} could not be loaded.` : 'This list could not be loaded.'}</span> {error}{' '}
                  {onRetry && <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">Retry</button>}</span></div>
              </td></tr>
            )}
            {!loading && !error && visible.map((r, i) => (
              <Fragment key={String(r[rowKey] ?? i)}>
                <tr onClick={clickable ? e => open(r, e) : undefined}
                  className={`${clickable ? 'cursor-pointer' : ''} hover:bg-surface-alt ${rowClass?.(r) ?? ''}`}>
                  {cols.map(c => (
                    <td key={c.key} className={`${ta(c)} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className ?? ''}`}>
                      <Cell c={c} r={r} />
                      {c.sub && r[c.sub.key] ? <div className={`mt-0.5 truncate text-[12px] font-normal text-faint ${c.sub.mono ? 'font-mono' : ''}`}><span className="sr-only">{c.sub.label}: </span>{String(r[c.sub.key])}</div> : null}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="w-px whitespace-nowrap text-right no-print" onClick={e => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-0.5">
                        {rowActions(r).sort((a, b) => ACTION_ORDER.indexOf(a.icon) - ACTION_ORDER.indexOf(b.icon)).map(a => {
                          const Icon = ACTION_ICON[a.icon]
                          const cls = `icon-btn ${a.tone === 'danger' ? 'icon-btn-danger' : ''}`
                          return a.href
                            ? <a key={a.label} href={a.href} className={cls} aria-label={a.label} title={a.label}><Icon size={15} /></a>
                            : <button key={a.label} type="button" disabled={a.disabled} onClick={a.onClick} className={cls} aria-label={a.label} title={a.label}><Icon size={15} /></button>
                        })}
                      </span>
                    </td>
                  )}
                </tr>
              </Fragment>
            ))}
            {!loading && !error && sorted.length === 0 && (
              <tr><td colSpan={colCount} className="!h-auto !p-0 hover:bg-transparent">
                {q ? <EmptyState icon={Search} title={`Nothing matches “${q}”`} description="Check the spelling, or clear the search." action={<button type="button" className="btn-secondary btn-sm" onClick={() => setQ('')}>Clear search</button>} />
                  : filtersActive ? <EmptyState title="No rows match these filters" description="Records exist, but the filters hide them." action={onClearFilters ? <button type="button" className="btn-secondary btn-sm" onClick={onClearFilters}>Clear filters</button> : undefined} />
                  : <EmptyState icon={empty?.icon} title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} />}
              </td></tr>
            )}
          </tbody>
          {hasTotals && !loading && !error && sorted.length > 0 && (
            <tfoot>
              <tr>
                {cols.map((c, i) => (
                  <td key={c.key} className={`${ta(c)} ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}>
                    {c.key in totals ? (c.kind === 'money' ? fmtINR(totals[c.key]) : totals[c.key].toLocaleString('en-IN', { maximumFractionDigits: 2 })) : i === 0 ? 'Total' : ''}
                  </td>
                ))}
                {rowActions && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!loading && !error && sorted.length > 0 && (sorted.length > 25 || summary) && (
        <div className="no-print flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[12px] text-muted">
          <span className="tabular-nums">
            {sorted.length > size ? `${(cur * size + 1).toLocaleString('en-IN')}–${Math.min((cur + 1) * size, sorted.length).toLocaleString('en-IN')} of ${sorted.length.toLocaleString('en-IN')}` : `${sorted.length.toLocaleString('en-IN')} ${sorted.length === 1 ? 'row' : 'rows'}`}
          </span>
          {sorted.length > 25 && (
            <label className="flex items-center gap-1.5">Per page
              <Select size="sm" className="w-[76px]" value={String(size)} ariaLabel="Rows per page" minPanelWidth={90}
                onChange={v => { setSize(Number(v)); setPage(0) }} options={[25, 50, 100, 250].map(n => ({ value: String(n), label: String(n) }))} />
            </label>
          )}
          {summary && <span className="tabular-nums text-ink">{summary(sorted)}</span>}
          {pages > 1 && (
            <nav className="ml-auto flex items-center gap-1" aria-label="Pagination">
              <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={cur === 0} onClick={() => setPage(0)} aria-label="First page" title="First page"><ChevronsLeft size={14} /></button>
              <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page" title="Previous page"><ChevronLeft size={14} /></button>
              <span className="px-2 tabular-nums">Page {cur + 1} of {pages}</span>
              <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page" title="Next page"><ChevronRight size={14} /></button>
              <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page" title="Last page"><ChevronsRight size={14} /></button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}

/** Download menu: formatted Excel, plain CSV, a print/PDF page, or copy to clipboard. */
export function ExportMenu({ input, disabled, size = 'sm' }: {
  input: () => { title: string; cols: ExportCol[]; rows: Row[]; note?: string }
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const run = (fn: () => unknown | Promise<unknown>, done?: string) => async () => {
    setOpen(false)
    setBusy(true)
    try {
      const ok = await fn()
      if (ok === false) toast('Allow pop-ups for this site to print', { tone: 'error' })
      else if (done) toast(done)
    } catch {
      toast('The export did not finish. Please try again.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const items: { icon: LucideIcon; label: string; hint: string; onClick: () => void }[] = [
    { icon: FileSpreadsheet, label: 'Excel workbook (.xlsx)', hint: 'Formatted, with totals and filters', onClick: run(() => downloadXlsx(input())) },
    { icon: FileText, label: 'CSV (.csv)', hint: 'Plain values, opens anywhere', onClick: run(() => downloadCsv(input())) },
    { icon: Printer, label: 'Print or save as PDF', hint: 'A4 page of the rows shown', onClick: run(() => printTable(input())) },
    { icon: ClipboardCopy, label: 'Copy rows', hint: 'Paste into Excel or Sheets', onClick: run(() => copyRows(input()), 'Rows copied to the clipboard') },
  ]
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`btn-secondary ${size === 'sm' ? 'btn-sm' : ''}`} onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} title="Export">
        <Download size={14} /><span className="hidden sm:inline">{busy ? 'Preparing…' : 'Export'}</span>
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 z-40 mt-1 w-64 overflow-hidden py-1">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" onClick={it.onClick}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-hover">
              <it.icon size={15} className="mt-0.5 shrink-0 text-faint" />
              <span><span className="block text-[13.5px] font-medium text-ink">{it.label}</span><span className="block text-[12px] text-faint">{it.hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
