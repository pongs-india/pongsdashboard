export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { initAuthTables, dbListAccessRequests, getDbClient } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

export async function GET(req: NextRequest) {
  // Viewing pending access requests is an admin-only board.
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const rows = await dbListAccessRequests(status)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  await initAuthTables()
  const db = getDbClient()
  const b = await req.json()
  if (!b.email || !b.name) return NextResponse.json({ error: 'Name and email required' }, { status: 400 })

  // Check if already requested or user exists
  const existing = await db.execute('SELECT id, status FROM access_requests WHERE email = ?', [b.email.toLowerCase()])
  if (existing.rows.length) {
    const st = String(existing.rows[0].status)
    if (st === 'pending') return NextResponse.json({ error: 'You already have a pending request.' }, { status: 409 })
    if (st === 'approved') return NextResponse.json({ error: 'Your request was already approved. Please log in.' }, { status: 409 })
  }

  const id = crypto.randomUUID()
  await db.execute(
    `INSERT INTO access_requests (id, name, email, phone, city, requested_role, reason) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (email) DO UPDATE SET id=excluded.id, name=excluded.name, phone=excluded.phone, city=excluded.city,
       requested_role=excluded.requested_role, reason=excluded.reason, status='pending',
       reviewed_by=NULL, reviewed_at=NULL, notes=NULL, created_at=excluded.created_at`,
    [id, b.name, b.email.toLowerCase(), b.phone ?? null, b.city ?? null, b.requested_role ?? 'viewer', b.reason ?? null]
  )
  return NextResponse.json({ ok: true, id }, { status: 201 })
}
