import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { dbGetSession } from './db'
import { rememberActor } from './actor'
import {
  parsePermissions,
  permitted,
  fullPermissions,
  type UserPermissions,
  type ModuleName,
  type ActionName,
} from './permissions'

// The one hard-coded, un-removable super admin. Every other admin is an admin
// purely because role === 'admin' in the database — see getSessionUser.
export const SEED_ADMIN_EMAIL = 'sidhanthrj@gmail.com'

export interface SessionUser {
  userId: string
  name: string
  email: string
  role: string
  isAdmin: boolean
  status: string
  permissions: UserPermissions
}

// Reads the pongs_session cookie and returns the authenticated user, or null.
// Central place for RBAC so permission logic is never duplicated across routes.
export async function getSessionUser(): Promise<SessionUser | null> {
  const sessionId = cookies().get('pongs_session')?.value
  if (!sessionId) return null
  const session = await dbGetSession(sessionId)
  if (!session) return null

  const role = String((session.role ?? session.access_level ?? 'viewer'))
  const email = String(session.email ?? '')
  const status = String(session.status ?? 'active')
  // Admin iff the DB role is 'admin' (this now works for EVERY admin, not just
  // the seed account) or the immutable seed admin email.
  const isAdmin = role === 'admin' || email.toLowerCase() === SEED_ADMIN_EMAIL

  // A deactivated account has no access at all.
  if (status !== 'active') return null

  const permissions = isAdmin
    ? fullPermissions()
    : parsePermissions(session.permissions_json)

  rememberActor(sessionId, String(session.name ?? ''), email)

  return {
    userId: String(session.user_id),
    name: String(session.name ?? ''),
    email,
    role,
    isAdmin,
    status,
    permissions,
  }
}

// ---------------------------------------------------------------------------
// Authorization guards for API routes / server actions. Each returns either
// `{ user }` on success or `{ error: NextResponse }` on failure, so callers do:
//
//   const auth = await requirePermission('quotes', 'edit')
//   if ('error' in auth) return auth.error
//   const { user } = auth
// ---------------------------------------------------------------------------

type Guard = { user: SessionUser } | { error: NextResponse }

const unauth = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// Any authenticated, active user.
export async function requireUser(): Promise<Guard> {
  const user = await getSessionUser()
  if (!user) return { error: unauth() }
  return { user }
}

// Full administrator only. Used for user management, permission editing and
// every other admin-only board (Masters, access requests, imports, etc).
export async function requireAdmin(): Promise<Guard> {
  const user = await getSessionUser()
  if (!user) return { error: unauth() }
  if (!user.isAdmin) return { error: forbidden() }
  return { user }
}

// A specific module/action capability. Admins always pass.
export async function requirePermission(
  module: ModuleName,
  action: ActionName,
): Promise<Guard> {
  const user = await getSessionUser()
  if (!user) return { error: unauth() }
  if (!permitted(user.permissions, user.isAdmin, module, action)) {
    return { error: forbidden() }
  }
  return { user }
}

export function can(
  user: SessionUser | null,
  module: ModuleName,
  action: ActionName,
): boolean {
  if (!user) return false
  return permitted(user.permissions, user.isAdmin, module, action)
}

// Server-page guard: may the current session view this quote (by owner email)?
// Admins always may; standard users only their own; legacy null-owner allowed.
export async function canAccessQuote(ownerEmail: string | undefined | null): Promise<boolean> {
  const user = await getSessionUser()
  if (!user) return false
  if (!can(user, 'quotes', 'view')) return false
  if (user.isAdmin) return true
  if (!ownerEmail) return true
  return ownerEmail === user.email
}

// Returns the owner-email filter to apply to quote queries:
//   null  → admin, sees everything
//   email → standard user, sees only their own quotes
export function ownerFilterFor(user: SessionUser | null): string | null {
  if (!user) return '__no_access__' // unauthenticated → matches nothing
  return user.isAdmin ? null : user.email
}

// Shape a user row for API responses: password hashes never leave the server.
export function publicUser<T extends Record<string, unknown> | null | undefined>(row: T) {
  if (!row) return row
  const { password_hash, ...rest } = row as Record<string, unknown>
  return { ...rest, has_password: !!password_hash }
}
