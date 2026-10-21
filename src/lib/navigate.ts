'use client'

// Client-side navigation from event handlers (clickable table rows, post-save
// redirects) without needing the router hook in every component. AppShell
// listens and routes it through Next's router; before the shell mounts it
// falls back to a normal page load.
export const NAVIGATE_EVENT = 'pongs:navigate'

export function navigate(href: string, e?: { metaKey?: boolean; ctrlKey?: boolean }) {
  if (e && (e.metaKey || e.ctrlKey)) { window.open(href, '_blank', 'noopener'); return }
  const handled = !window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: href, cancelable: true }))
  if (!handled) window.location.href = href
}
