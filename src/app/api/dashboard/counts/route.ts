export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { ensureSchema, getDbClient } from '@/lib/db'
import { requireUser, can } from '@/lib/session'

// Record counts for the dashboard's setup guide and badges, in one request.
// Each count is only returned for modules the user may view; the dashboard
// used to download whole lists (every product, client and user) to count them.
export async function GET() {
  const guard = await requireUser()
  if ('error' in guard) return guard.error
  const user = guard.user
  await ensureSchema()
  const db = getDbClient()

  const wanted: [string, string][] = []
  if (can(user, 'inventory', 'view')) wanted.push(['products', 'SELECT COUNT(*) AS c FROM inv_products'])
  if (can(user, 'clients', 'view')) wanted.push(['clients', 'SELECT COUNT(*) AS c FROM clients'])
  if (user.isAdmin) {
    wanted.push(['users', 'SELECT COUNT(*) AS c FROM app_users'])
    wanted.push(['pendingRequests', "SELECT COUNT(*) AS c FROM access_requests WHERE status = 'pending'"])
  }
  const results = await Promise.all(wanted.map(([, sql]) => db.execute(sql)))
  const counts: Record<string, number> = {}
  wanted.forEach(([key], i) => { counts[key] = Number(results[i].rows[0]?.c ?? 0) })
  return NextResponse.json(counts)
}
