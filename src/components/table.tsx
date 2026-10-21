'use client'

import { useEffect, useMemo, useState, type ReactNode, type ThHTMLAttributes } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react'

// Data-table building blocks shared by every list screen: sortable headers,
// client-side pagination and CSV export of exactly what the user is looking at.

export type SortDir = 'asc' | 'desc'
export type SortState<K extends string> = { key: K; dir: SortDir } | null
type Accessor<T> = (row: T) => string | number | null | undefined

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' })

function compare(a: unknown, b: unknown) {
  const empty = (v: unknown) => v === null || v === undefined || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1 // blanks always sink to the bottom
  if (empty(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

export function useSort<T, A extends Record<string, Accessor<T>>>(rows: T[], accessors: A, initial: SortState<Extract<keyof A, string>> = null) {
  type K = Extract<keyof A, string>
  const [sort, setSort] = useState<SortState<K>>(initial)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const get = accessors[sort.key]
    const out = [...rows].sort((x, y) => {
      const c = compare(get(x), get(y))
      // Blanks stay last in both directions.
      const blankX = get(x) === null || get(x) === undefined || get(x) === ''
      const blankY = get(y) === null || get(y) === undefined || get(y) === ''
      if (blankX !== blankY) return c
      return sort.dir === 'asc' ? c : -c
    })
    return out
    // accessors are stable object literals per render; sort by identity of rows + sort
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  function toggle(key: K) {
    setSort(s => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
  }
  return { sorted, sort, toggle }
}

export function SortHeader<K extends string>({ label, sortKey, sort, onSort, className = '', align = 'left', ...rest }: {
  label: ReactNode
  sortKey: K
  sort: SortState<K>
  onSort: (k: K) => void
  align?: 'left' | 'right'
} & ThHTMLAttributes<HTMLTableCellElement>) {
  const active = sort?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th {...rest} className={`${className} ${align === 'right' ? 'num' : ''}`}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={`group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-gray-900 ${active ? 'text-gray-900' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <Icon size={12} className={active ? 'text-gray-700' : 'text-gray-300 group-hover:text-gray-500'} aria-hidden />
      </button>
    </th>
  )
}

export function usePagination<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  // Filters shrinking the list must never strand the user on an empty page.
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [page, pages])
  const start = Math.min(page, pages - 1) * pageSize
  return {
    pageRows: rows.slice(start, start + pageSize),
    page: Math.min(page, pages - 1),
    pages,
    setPage,
    from: rows.length ? start + 1 : 0,
    to: Math.min(start + pageSize, rows.length),
    total: rows.length,
  }
}

export function Pagination({ page, pages, setPage, from, to, total, noun = 'rows', summary }: {
  page: number; pages: number; setPage: (p: number) => void; from: number; to: number; total: number; noun?: string; summary?: ReactNode
}) {
  return (
    <div className="table-footer">
      <span className="tabular-nums">
        {total === 0 ? `No ${noun}` : pages > 1 ? `${from}–${to} of ${total} ${noun}` : `${total} ${noun}`}
      </span>
      <div className="flex items-center gap-3">
        {summary && <span className="hidden sm:inline tabular-nums">{summary}</span>}
        {pages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button type="button" className="btn-ghost btn-xs !h-7 !w-7 !px-0" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[56px] text-center tabular-nums text-gray-700">{page + 1} / {pages}</span>
            <button type="button" className="btn-ghost btn-xs !h-7 !w-7 !px-0" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}

// CSV with a UTF-8 BOM so Excel opens ₹ and Indian names correctly.
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    // Neutralise spreadsheet formula injection from user-entered text.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const csv = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary">
      <Download size={14} /> Export CSV
    </button>
  )
}

// Keeps list filters in the URL (?status=sent&q=mehta) so views can be
// bookmarked, shared and survive a refresh. Uses replaceState: no history spam.
export function useUrlState(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState(fallback)
  useEffect(() => {
    const v = new URL(window.location.href).searchParams.get(key)
    if (v !== null) setValue(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function set(v: string) {
    setValue(v)
    const url = new URL(window.location.href)
    if (v === fallback || v === '') url.searchParams.delete(key)
    else url.searchParams.set(key, v)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
  return [value, set]
}
