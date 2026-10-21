export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { TABLE_LABEL, UNDO_DAYS } from '@/lib/auditLabels'

// Put a deleted record back exactly as it was. Compare-and-set: only when the
// record is still gone and the entry has not been restored already.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const db = getDbClient()
  const r = await db.execute(
    `select id, table_name, row_pk, old_data, restored_at, (at > now() - make_interval(days => ${UNDO_DAYS})) as fresh
     from audit_log where id = ? and action = 'delete'`, [Number(params.id)])
  const e = r.rows[0]
  if (!e) return NextResponse.json({ error: 'That entry is not a deletion.' }, { status: 404 })
  if (e.restored_at) return NextResponse.json({ error: 'This record was already restored.' }, { status: 409 })
  if (!e.fresh) return NextResponse.json({ error: `Deletions older than ${UNDO_DAYS} days cannot be restored.` }, { status: 410 })
  const table = String(e.table_name)
  if (!TABLE_LABEL[table]) return NextResponse.json({ error: 'This record type cannot be restored.' }, { status: 400 })
  const ins = await db.execute(
    `INSERT INTO ${table} SELECT * FROM jsonb_populate_record(null::${table}, ?::jsonb) ON CONFLICT DO NOTHING`,
    // The driver serialises jsonb parameters itself: pass the object, not a string.
    [(typeof e.old_data === 'string' ? JSON.parse(e.old_data) : e.old_data) as never])
  if (ins.rowsAffected === 0) return NextResponse.json({ error: 'A record with this id already exists, so nothing was restored.' }, { status: 409 })
  await db.execute(`update audit_log set restored_at = now(), restored_by = ? where id = ?`, [`${guard.user.name} <${guard.user.email}>`, Number(params.id)])
  return NextResponse.json({ ok: true, table, id: e.row_pk })
}
