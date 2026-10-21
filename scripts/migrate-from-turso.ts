// One-off copy of every table from Turso (libsql) into Supabase Postgres.
// Idempotent: rows already in Postgres (same primary key) are left alone, so
// it is safe to re-run. Prints a source vs destination row count per table.
//
// Needs TURSO_URL, TURSO_AUTH_TOKEN and DATABASE_URL in .env.local, then:
//   npx tsx --env-file=.env.local scripts/migrate-from-turso.ts
import { createClient } from '@libsql/client'
import { getDbClient } from '../src/lib/db'
import { ensureTables } from './init-db-tables'

const TABLES = [
  'app_users', 'auth_sessions', 'access_requests', 'role_permissions', 'user_activity_log',
  'clients', 'pongs_quotes', 'follow_ups',
  'projects', 'project_materials', 'project_updates', 'project_payments', 'project_expenses', 'project_checklists',
  'inv_suppliers', 'inv_products', 'inv_purchases', 'inv_purchase_items', 'inv_movements', 'inv_work_completions',
]

async function main() {
  const url = process.env.TURSO_URL
  if (!url) throw new Error('TURSO_URL not set')
  const turso = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  const pg = getDbClient()
  await ensureTables()

  let mismatches = 0
  for (const table of TABLES) {
    const exists = await turso.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [table] })
    if (!exists.rows.length) { console.log(`${table.padEnd(22)} not in Turso, skipped`); continue }

    const destCols = new Set((await pg.execute(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?`, [table],
    )).rows.map(r => String(r.column_name)))
    const src = await turso.execute(`SELECT * FROM ${table}`)
    const cols = src.columns.filter(c => destCols.has(c))
    const dropped = src.columns.filter(c => !destCols.has(c))
    if (dropped.length) console.warn(`  ${table}: columns not in Postgres, not copied: ${dropped.join(', ')}`)

    // role_permissions is seeded on first boot; Turso's copy is the source of truth.
    if (table === 'role_permissions') await pg.execute('DELETE FROM role_permissions')
    // The app seeds its admin on first boot with a fresh id. Drop any account
    // Turso also has (matched by email) so it isn't duplicated under a new id.
    if (table === 'app_users') {
      for (const row of src.rows) {
        const email = (row as Record<string, unknown>).email
        if (email) await pg.execute('DELETE FROM app_users WHERE email = ? AND id != ?', [String(email), String((row as Record<string, unknown>).id)])
      }
    }

    for (let i = 0; i < src.rows.length; i += 200) {
      const chunk = src.rows.slice(i, i + 200)
      const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
      const args = chunk.flatMap(row => cols.map(c => {
        const v = (row as Record<string, unknown>)[c]
        return typeof v === 'bigint' ? Number(v) : (v as string | number | null)
      }))
      await pg.execute(
        `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(',')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        args,
      )
    }

    const destCount = Number((await pg.execute(`SELECT COUNT(*) AS c FROM ${table}`)).rows[0].c)
    const ok = destCount >= src.rows.length
    if (!ok) mismatches++
    console.log(`${table.padEnd(22)} turso ${String(src.rows.length).padStart(6)}   supabase ${String(destCount).padStart(6)}   ${ok ? 'ok' : 'MISSING ROWS'}`)
  }
  console.log(mismatches ? `\n${mismatches} table(s) incomplete` : '\nAll tables copied.')
  process.exit(mismatches ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
