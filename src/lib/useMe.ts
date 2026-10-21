'use client'
import { useEffect, useState } from 'react'
import type { UserPermissions, ModuleName, ActionName } from './permissions'

export interface Me {
  id: string
  name: string
  email: string
  role: string
  isAdmin: boolean
  permissions: UserPermissions
}

export function can(me: Me | null, module: ModuleName, action: ActionName): boolean {
  if (!me) return false
  if (me.isAdmin) return true
  const mod = me.permissions?.[module]
  if (!mod) return false
  if (action !== 'view' && !mod.view) return false
  return !!mod[action]
}

// One request per page session, shared by every component that asks (shell,
// user menu, gates, pages). Each /api/auth/me is a database round trip, so
// this used to cost 3–5 identical queries per page view.
let cached: Me | null | undefined
let inflight: Promise<Me | null> | null = null
// True when the check itself failed (network or server error), as opposed to
// "checked and not signed in". Callers must not treat it as a sign-out.
let lastError = false

function loadMe(): Promise<Me | null> {
  if (cached !== undefined) return Promise.resolve(cached)
  inflight ??= fetch('/api/auth/me')
    .then(async r => {
      if (!r.ok && r.status !== 401) throw new Error(String(r.status))
      const d = r.ok ? await r.json().catch(() => null) : null
      lastError = false
      return (cached = d?.email ? (d as Me) : null)
    })
    .catch(() => { lastError = true; return null })
    .finally(() => { inflight = null })
  return inflight
}

// Call after sign-in, sign-out or a permission change.
export function resetMe() {
  cached = undefined
  inflight = null
}

// `loading` is true until the user is known so gates don't flash the wrong state.
export function useMe(): { me: Me | null; loading: boolean; error: boolean } {
  const [me, setMe] = useState<Me | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    loadMe().then(d => { if (active) { setMe(d); setError(lastError); setLoading(false) } })
    return () => { active = false }
  }, [])
  return { me, loading, error }
}
