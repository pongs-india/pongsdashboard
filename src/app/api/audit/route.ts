export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema, getDbClient } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { TABLE_LABEL, ACTION_LABEL, UNDO_DAYS } from '@/lib/auditLabels'

const DAY = /^\d{4}-\d{2}-\d{2}$/


// Admin only. Filters: table, action, actor, record (id or text inside the
// record), from/to (India dates), tab=deleted. Paged on the server.
export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  await ensureSchema()
  const db = getDbClient()
  const sp = req.nextUrl.searchParams
  const where: string[] = ['true']
  const args: (string | number)[] = []
  const table = sp.get('table'); if (table && TABLE_LABEL[table]) { where.push('table_name = ?'); args.push(table) }
  const action = sp.get('action'); if (action && ACTION_LABEL[action]) { where.push('action = ?'); args.push(action) }
  if (sp.get('tab') === 'deleted') where.push(`action = 'delete'`)
  const actor = sp.get('actor'); if (actor) { where.push('actor = ?'); args.push(actor) }
  const record = sp.get('record')?.trim()
  if (record) {
    where.push(`(row_pk = ? or coalesce(label, '') ILIKE ? or coalesce(new_data::text, '') ILIKE ? or coalesce(old_data::text, '') ILIKE ?)`)
    args.push(record, `%${record}%`, `%${record}%`, `%${record}%`)
  }
  const from = sp.get('from'); if (from && DAY.test(from)) { where.push(`at >= (?::date)::timestamp at time zone 'Asia/Kolkata'`); args.push(from) }
  const to = sp.get('to'); if (to && DAY.test(to)) { where.push(`at < (?::date + 1)::timestamp at time zone 'Asia/Kolkata'`); args.push(to) }
  const limit = Math.min(5000, Math.max(1, Number(sp.get('limit') ?? 50) || 50))
  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0)
  const w = where.join(' and ')

  const [count, rows, actors] = await Promise.all([
    db.execute(`select count(*) as total from audit_log where ${w}`, args),
    db.execute(
      `select id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at, actor, ip, user_agent, table_name, row_pk, action, label,
              old_data, new_data, to_char(restored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as restored_at, restored_by,
              (action = 'delete' and restored_at is null and at > now() - make_interval(days => ${UNDO_DAYS})) as restorable
       from audit_log where ${w} order by at desc, id desc limit ${limit} offset ${page * limit}`, args),
    db.execute(`select distinct actor from audit_log order by 1`),
  ])
  return NextResponse.json({
    total: Number(count.rows[0]?.total ?? 0),
    rows: rows.rows,
    actors: actors.rows.map(r => String(r.actor)),
  })
}
