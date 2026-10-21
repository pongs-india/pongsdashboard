'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { NAVIGATE_EVENT } from '@/lib/navigate'

// A thin bar at the top while the next page loads, so a slow page never looks
// finished early. Starts on same-site link clicks and programmatic navigation;
// stops when the URL has changed (the new page rendered).
export default function NavProgress() {
  const path = usePathname()
  const sp = useSearchParams()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // A short delay so instant navigations never flash the bar.
    const start = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setState('loading'), 120) }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return
      if (url.pathname === location.pathname && url.search === location.search) return
      start()
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener(NAVIGATE_EVENT, start)
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener(NAVIGATE_EVENT, start) }
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setState(s => (s === 'loading' ? 'done' : 'idle'))
    const t = setTimeout(() => setState('idle'), 300)
    return () => clearTimeout(t)
  }, [path, sp])

  if (state === 'idle') return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden">
      <div className={`h-full bg-brand ${state === 'loading' ? 'nav-progress' : 'w-full opacity-0 transition-opacity duration-300'}`} />
    </div>
  )
}
