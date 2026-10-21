'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CornerDownLeft, FileText, HardHat, Plus, Search, Users2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NavItem } from '@/components/AppShell'

type Item = { id: string; label: string; hint?: string; href: string; icon: LucideIcon; group: string; keywords?: string }

const OPEN_EVENT = 'pongs:command-menu'
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

// Records are fetched once per page session, the first time the menu opens.
let recordCache: Item[] | null = null
async function loadRecords(): Promise<Item[]> {
  if (recordCache) return recordCache
  const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : [])).catch(() => [])
  const [quotes, clients, projects] = await Promise.all([get('/api/quotes'), get('/api/clients'), get('/api/projects')])
  const out: Item[] = []
  for (const q of Array.isArray(quotes) ? quotes : []) {
    out.push({
      id: `q:${q.id}`, group: 'Quotes', icon: FileText, href: `/quotes/${q.id}/team`,
      label: `${q.quoteNumber ?? 'Quote'} · ${q.clientName ?? ''}`, hint: q.projectName ?? undefined,
      keywords: `${q.projectName ?? ''} ${q.location ?? ''}`,
    })
  }
  for (const c of Array.isArray(clients) ? clients : []) {
    out.push({ id: `c:${c.id}`, group: 'Clients', icon: Users2, href: `/clients/${c.id}`, label: c.name, hint: c.company || c.city || undefined, keywords: `${c.email ?? ''} ${c.phone ?? ''}` })
  }
  for (const p of Array.isArray(projects) ? projects : []) {
    out.push({ id: `p:${p.id}`, group: 'Projects', icon: HardHat, href: `/projects/${p.id}`, label: p.name, hint: p.client_name || undefined, keywords: p.city ?? '' })
  }
  recordCache = out
  return out
}

function score(item: Item, q: string) {
  const hay = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  const label = item.label.toLowerCase()
  if (label.startsWith(q)) return 3
  if (label.includes(q)) return 2
  return q.split(/\s+/).every(t => hay.includes(t)) ? 1 : 0
}

export default function CommandMenu({ sections, canQuote }: { sections: { title?: string; items: NavItem[] }[]; canQuote: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<Item[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const router = useRouter()

  const show = useCallback(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null
    setOpen(true)
    setQuery('')
    setActive(0)
    if (!recordCache) setLoadingRecords(true)
    loadRecords().then(r => { setRecords(r); setLoadingRecords(false) })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    restoreFocus.current?.focus?.()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? close() : show() }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, show)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, show) }
  }, [open, show, close])

  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()) }, [open])

  const pages = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const s of sections) for (const n of s.items) {
      out.push({ id: `nav:${n.href}`, group: 'Pages', icon: n.icon, href: n.href, label: n.label, hint: s.title })
      for (const c of n.children ?? []) if (c.href !== n.href) out.push({ id: `nav:${c.href}`, group: 'Pages', icon: n.icon, href: c.href, label: `${n.label} › ${c.label}` })
    }
    return out
  }, [sections])

  const actions = useMemo<Item[]>(() => [
    ...(canQuote ? [{ id: 'act:quote', group: 'Actions', icon: Plus, href: '/quotes/new', label: 'Create quote', keywords: 'new quotation estimate' }] : []),
    { id: 'act:client', group: 'Actions', icon: Plus, href: '/clients?new=1', label: 'Add client', keywords: 'new customer' },
    { id: 'act:project', group: 'Actions', icon: Plus, href: '/projects/all?new=1', label: 'Add project', keywords: 'new job installation' },
  ], [canQuote])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...actions, ...pages.slice(0, 8)]
    const ranked = [...actions, ...pages, ...records]
      .map(i => ({ i, s: score(i, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
    // Keep groups together in a stable order while respecting rank inside each.
    const order = ['Actions', 'Pages', 'Quotes', 'Clients', 'Projects']
    return order.flatMap(g => ranked.filter(x => x.i.group === g).slice(0, g === 'Pages' ? 6 : 8).map(x => x.i))
  }, [query, actions, pages, records])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item: Item | undefined) {
    if (!item) return
    setOpen(false)
    router.push(item.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') e.preventDefault()
  }

  if (!open) return null

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-gray-950/40 px-4 pt-[12vh] animate-fade-in" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Search and jump to"
        className="w-full max-w-[600px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl animate-scale-in"
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-4">
          <Search size={16} className="shrink-0 text-gray-400" aria-hidden />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            placeholder="Search quotes, clients, projects or pages…"
            className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none" />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-10 text-center text-[13px] text-gray-500">
              {loadingRecords ? 'Loading records…' : <>No matches for “{query}”.</>}
            </p>
          )}
          {results.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            const Icon = item.icon
            const on = idx === active
            return (
              <div key={item.id}>
                {header && <p className="px-2.5 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{header}</p>}
                <div id={`cmd-${item.id}`} role="option" aria-selected={on} data-index={idx}
                  onMouseMove={() => setActive(idx)} onClick={() => go(item)}
                  className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] ${on ? 'bg-brand-50 text-brand-800' : 'text-gray-700'}`}>
                  <Icon size={15} strokeWidth={1.75} className={on ? 'text-brand-600' : 'text-gray-400'} />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.hint && <span className="truncate text-gray-500">{item.hint}</span>}
                  {on && <ArrowRight size={14} className="ml-auto shrink-0 text-brand-600" />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-200 bg-gray-50 px-4 h-9 text-2xs text-gray-500">
          <span className="inline-flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> Navigate</span>
          <span className="inline-flex items-center gap-1"><kbd className="kbd"><CornerDownLeft size={10} /></kbd> Open</span>
          <span className="ml-auto">{loadingRecords ? 'Loading records…' : `${records.length} records indexed`}</span>
        </div>
      </div>
    </div>
  )
}
