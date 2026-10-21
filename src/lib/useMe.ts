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

function loadMe(): Promise<Me | null> {
  if (cached !== undefined) return Promise.resolve(cached)
  inflight ??= fetch('/api/auth/me')
    .then(r => (r.ok ? r.json() : null))
    .then(d => (cached = d?.email ? (d as Me) : null))
    .catch(() => null)
    .finally(() => { inflight = null })
  return inflight
}

// Call after sign-in, sign-out or a permission change.
export function resetMe() {
  cached = undefined
  inflight = null
}

// `loading` is true until the user is known so gates don't flash the wrong state.
export function useMe(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  useEffect(() => {
    let active = true
    loadMe().then(d => { if (active) { setMe(d); setLoading(false) } })
    return () => { active = false }
  }, [])
  return { me, loading }
}
