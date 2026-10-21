// Creates every table in the database named by DATABASE_URL (idempotent) and
// lists them with their row-level-security flag.
// Run: npx tsx --env-file=.env.local scripts/init-db.ts
import { getDbClient } from '../src/lib/db'
import { ensureTables } from './init-db-tables'

async function main() {
  await ensureTables()
  const r = await getDbClient().execute(
    `SELECT c.relname AS table, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`)
  console.table(r.rows)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
