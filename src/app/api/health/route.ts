export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getDbClient } from '@/lib/db'
import { requireUser } from '@/lib/session'

// Lightweight status for the dashboard pill: can the app reach its database, and how fast.
export async function GET() {
  const guard = await requireUser()
  if ('error' in guard) return guard.error
  const t = Date.now()
  try {
    await getDbClient().execute('select 1')
    return NextResponse.json({ ok: true, ms: Date.now() - t })
  } catch {
    return NextResponse.json({ ok: false, ms: Date.now() - t }, { status: 503 })
  }
}
