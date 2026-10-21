export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { initPaymentsTable, initProjectsTables, getDbClient } from '@/lib/db'
import { requirePermission } from '@/lib/session'

export async function GET() {
  const _auth = await requirePermission('finance', 'view')
  if ('error' in _auth) return _auth.error
  await initProjectsTables()
  await initPaymentsTable()
  const db = getDbClient()

  // One query instead of two per project: totals are aggregated in Postgres.
  const r = await db.execute(`
    SELECT p.id, p.name, p.client_name, p.status, p.contract_value, p.created_at,
           COALESCE(pay.total, 0) AS total_paid,
           COALESCE(exp.total, 0) AS total_expenses
    FROM projects p
    LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM project_payments GROUP BY project_id) pay ON pay.project_id = p.id
    LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM project_expenses GROUP BY project_id) exp ON exp.project_id = p.id
    ORDER BY p.created_at DESC`)
  const result = r.rows.map(p => ({ ...p, total_paid: Number(p.total_paid ?? 0), total_expenses: Number(p.total_expenses ?? 0) }))

  return NextResponse.json(result)
}
