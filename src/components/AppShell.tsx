'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FileText, HardHat, Boxes, Users2, Wallet, BarChart3,
  ShieldCheck, Inbox, DatabaseZap, Menu, X, Plus, ChevronRight, Search,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'
import UserMenu from '@/components/UserMenu'
import CommandMenu, { openCommandMenu } from '@/components/CommandMenu'
import { useMe, can } from '@/lib/useMe'
import { NAVIGATE_EVENT } from '@/lib/navigate'
import type { ModuleName } from '@/lib/permissions'

type NavChild = { href: string; label: string }
export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  module?: ModuleName
  admin?: boolean
  children?: NavChild[]
}
type NavSection = { title?: string; items: NavItem[] }

// Grouped by job to be done. Each link declares the capability that unlocks
// it; the nav is advisory and every destination enforces access server-side.
export const NAV: NavSection[] = [
  { items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' }] },
  {
    title: 'Sales',
    items: [
      { href: '/quotes', label: 'Quotes', icon: FileText, module: 'quotes' },
      { href: '/clients', label: 'Clients', icon: Users2, module: 'clients' },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        href: '/projects', label: 'Projects', icon: HardHat, module: 'projects',
        children: [
          { href: '/projects', label: 'Overview' },
          { href: '/projects/all', label: 'All projects' },
          { href: '/projects/calendar', label: 'Schedule' },
          { href: '/projects/completed', label: 'Completed' },
        ],
      },
      {
        href: '/inventory', label: 'Inventory', icon: Boxes, module: 'inventory',
        children: [
          { href: '/inventory', label: 'Overview' },
          { href: '/inventory/products', label: 'Products' },
          { href: '/inventory/fabric-rolls', label: 'Fabric rolls' },
          { href: '/inventory/suppliers', label: 'Suppliers' },
          { href: '/inventory/purchases', label: 'Purchases' },
          { href: '/inventory/movements', label: 'Stock movements' },
          { href: '/inventory/reorder', label: 'Reorder alerts' },
          { href: '/inventory/work-completion', label: 'Work completion' },
          { href: '/inventory/activity', label: 'Activity' },
        ],
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/finance', label: 'Finance', icon: Wallet, module: 'finance' },
      { href: '/analytics', label: 'Analytics', icon: BarChart3, module: 'analytics' },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        href: '/users', label: 'Team & access', icon: ShieldCheck, admin: true,
        children: [
          { href: '/users', label: 'Overview' },
          { href: '/users/all', label: 'All users' },
          { href: '/users/permissions', label: 'Access overview' },
          { href: '/users/activity', label: 'Activity log' },
        ],
      },
      { href: '/admin/access-requests', label: 'Access requests', icon: Inbox, admin: true },
      { href: '/admin/import', label: 'Data import', icon: DatabaseZap, admin: true },
    ],
  },
]

// Routes that render without the application chrome.
const BARE_ROUTES = ['/login', '/request-access']

function inSection(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

// Most specific child that matches (/inventory/products/123 lights "Products").
function activeChild(pathname: string, children: NavChild[]) {
  let best: NavChild | null = null
  for (const c of children) {
    const hit = pathname === c.href || pathname.startsWith(c.href + '/')
    if (hit && (!best || c.href.length > best.href.length)) best = c
  }
  return best?.href ?? null
}

const SEGMENT_LABELS: Record<string, string> = {
  quotes: 'Quotes', new: 'New quote', edit: 'Edit', client: 'Client PDF', internal: 'Internal review',
  team: 'Overview', revisions: 'Revisions', projects: 'Projects', all: 'All', calendar: 'Schedule',
  completed: 'Completed', inventory: 'Inventory', products: 'Products', 'fabric-rolls': 'Fabric rolls',
  suppliers: 'Suppliers', purchases: 'Purchases', movements: 'Stock movements', reorder: 'Reorder alerts',
  'work-completion': 'Work completion', activity: 'Activity', clients: 'Clients', finance: 'Finance',
  analytics: 'Analytics', users: 'Team & access', permissions: 'Access overview', admin: 'Admin',
  'access-requests': 'Access requests', import: 'Data import', design: 'Design system',
}

function breadcrumbs(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return [{ href: '/', label: 'Dashboard' }]
  const crumbs: { href: string; label: string }[] = []
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    if (p === 'admin') continue
    const label = SEGMENT_LABELS[p] ?? (/^[0-9a-z-]{6,}$/i.test(p) && /\d/.test(p) ? 'Details' : p)
    crumbs.push({ href: acc, label })
  }
  return crumbs
}

// Pages are written with plain <a href> links. Route same-origin clicks through
// the client router so navigation keeps the shell, fonts and cached data
// instead of reloading the whole document.
function useClientNavigation() {
  const router = useRouter()
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || !a.href || a.target || a.hasAttribute('download') || a.dataset.reload !== undefined) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return
      e.preventDefault()
      router.push(url.pathname + url.search + url.hash)
    }
    function onNavigate(e: Event) {
      e.preventDefault()
      router.push(String((e as CustomEvent<string>).detail))
    }
    document.addEventListener('click', onClick)
    window.addEventListener(NAVIGATE_EVENT, onNavigate)
    return () => { document.removeEventListener('click', onClick); window.removeEventListener(NAVIGATE_EVENT, onNavigate) }
  }, [router])
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const [mobileOpen, setMobileOpen] = useState(false)
  const { me, loading: meLoading } = useMe()
  useClientNavigation()

  useEffect(() => { setMobileOpen(false) }, [pathname])

  if (BARE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return <>{children}</>
  }

  const allowed = (l: NavItem) => (l.admin ? !!me?.isAdmin : l.module ? can(me, l.module, 'view') : true)
  const sections = NAV.map(s => ({ ...s, items: s.items.filter(allowed) })).filter(s => s.items.length)
  const crumbs = breadcrumbs(pathname)
  const canQuote = can(me, 'quotes', 'create')

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center px-4">
        <Link href="/" className="inline-flex items-center rounded focus-visible:outline-offset-4" aria-label="Pongs India home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pongs-logo.png" alt="Pongs India" width={67} height={28} className="h-7 w-auto" />
        </Link>
      </div>

      <div className="px-3 pb-2">
        <button type="button" onClick={openCommandMenu}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 text-[13px] text-gray-500 transition-colors hover:border-gray-300 hover:bg-white">
          <Search size={14} className="shrink-0 text-gray-400" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-1 space-y-4">
        {meLoading ? (
          <div className="space-y-2 px-2 pt-1" aria-hidden>
            {[64, 48, 56, 72, 52, 60, 44].map((w, i) => (
              <div key={i} className="flex h-6 items-center gap-2.5"><span className="skeleton h-4 w-4" /><span className="skeleton h-3" style={{ width: w }} /></div>
            ))}
          </div>
        ) : sections.map((s, i) => <NavGroup key={i} title={s.title} items={s.items} pathname={pathname} />)}
      </nav>

      <div className="shrink-0 border-t border-gray-200 p-2">
        <UserMenu />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] btn-secondary">Skip to content</a>

      <aside className="app-sidebar hidden lg:block fixed inset-y-0 left-0 z-40 w-[var(--sidebar-w)] border-r border-gray-200 bg-white">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-gray-950/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="app-sidebar absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white border-r border-gray-200 shadow-xl animate-slide-in-left">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute right-2 top-2.5 btn-ghost btn-icon">
              <X size={16} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="app-main lg:ml-[var(--sidebar-w)] flex min-h-screen flex-col">
        <header className="app-topbar sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-4 sm:px-6">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="lg:hidden btn-ghost btn-icon -ml-1.5">
            <Menu size={18} />
          </button>
          <Link href="/" className="lg:hidden mr-1 inline-flex items-center" aria-label="Pongs India home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pongs-logo.png" alt="" width={53} height={22} className="h-[22px] w-auto" />
          </Link>
          <nav aria-label="Breadcrumb" className="hidden sm:flex min-w-0 items-center gap-1 text-[13px]">
            <ol className="flex min-w-0 items-center gap-1">
              {crumbs.map((c, i) => (
                <li key={c.href} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="shrink-0 text-gray-300" aria-hidden />}
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page" className="truncate font-medium text-gray-900">{c.label}</span>
                  ) : (
                    <Link href={c.href} className="truncate text-gray-500 hover:text-gray-900">{c.label}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={openCommandMenu} aria-label="Search" className="lg:hidden btn-ghost btn-icon">
              <Search size={16} strokeWidth={1.75} />
            </button>
            <NotificationBell />
            {canQuote && !['/', '/quotes', '/quotes/new'].includes(pathname) && (
              <Link href="/quotes/new" className="btn-primary btn-sm ml-1">
                <Plus size={14} strokeWidth={2.25} /> <span className="hidden sm:inline">New quote</span>
              </Link>
            )}
          </div>
        </header>

        <main id="main" tabIndex={-1} className="app-content flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 focus:outline-none">
          {children}
        </main>
      </div>

      <CommandMenu sections={sections} canQuote={canQuote} />
    </div>
  )
}

function NavGroup({ title, items, pathname }: { title?: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      {title && <p className="px-2 mb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{title}</p>}
      <ul className="space-y-px">
        {items.map(item => {
          const active = inSection(pathname, item.href)
          const Icon = item.icon
          const child = active && item.children ? activeChild(pathname, item.children) : null
          const exact = active && (!item.children || child === item.href)
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={exact ? 'page' : undefined}
                className={`group relative flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}>
                <Icon size={16} strokeWidth={1.75} className={active ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600'} />
                <span className="truncate">{item.label}</span>
              </Link>
              {active && item.children && (
                <ul className="mt-0.5 mb-1 ml-[17px] border-l border-gray-200 pl-2 space-y-px">
                  {item.children.map(c => {
                    const on = child === c.href
                    return (
                      <li key={c.href}>
                        <Link href={c.href} aria-current={on ? 'page' : undefined}
                          className={`relative flex items-center h-7 px-2 rounded-md text-[13px] transition-colors ${
                            on ? 'text-gray-900 font-medium bg-gray-100' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                          }`}>
                          {on && <span className="absolute -left-[9px] top-1 bottom-1 w-0.5 rounded-full bg-brand-600" aria-hidden />}
                          {c.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
