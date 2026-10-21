import postgres from 'postgres'

// Thin adapter over Supabase Postgres that keeps the `execute(sql, args)` →
// `{ rows }` shape the app was written against (libsql/Turso). Queries are
// still written in the SQLite dialect the codebase grew up with; `toPostgres`
// rewrites the handful of constructs that differ so call sites stay unchanged.

export type InValue = string | number | boolean | null | undefined
export type Row = Record<string, unknown>
export interface ResultSet { rows: Row[]; rowsAffected: number }
export interface DbClient { execute(sql: string, args?: InValue[]): Promise<ResultSet> }

// Timestamps are stored as UTC text ('YYYY-MM-DD HH:MM:SS'), exactly as
// SQLite's datetime('now') wrote them, so existing string comparisons and
// substr()/LIKE month filters keep working on migrated rows.
const NOW_TEXT = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`

export function toPostgres(sql: string): string {
  let out = sql
    .replace(/datetime\('now'\)/gi, NOW_TEXT)
    // SQLite REAL is 8 bytes; Postgres REAL is 4 and would round money.
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(/\bADD COLUMN (?!IF NOT EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS ')
    // SQLite LIKE is case-insensitive for ASCII; ILIKE keeps search behaviour.
    .replace(/\bLIKE\b/g, 'ILIKE')
  // Positional `?` → `$n`, skipping anything inside quoted literals.
  let n = 0
  let quote: string | null = null
  let res = ''
  for (const ch of out) {
    if (quote) {
      if (ch === quote) quote = null
      res += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      res += ch
    } else if (ch === '?') {
      res += `$${++n}`
    } else {
      res += ch
    }
  }
  out = res
  return out
}

type Sql = ReturnType<typeof postgres>
// Kept on globalThis so dev hot-reloads reuse one pool instead of leaking a new
// one per edit (leaked pools leave stalled sessions holding table locks).
const g = globalThis as unknown as { __pongsSql?: Sql }

function connection(): Sql {
  if (!g.__pongsSql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL env var not set')
    g.__pongsSql = postgres(url, {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      ssl: 'require',
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // Recycle connections so the pooler never holds a stale one for long.
      max_lifetime: 60 * 10,
      // "column already exists, skipping" from idempotent migrations is expected.
      onnotice: () => {},
      // COUNT/SUM over integers come back as int8/numeric; the app treats them as numbers.
      types: {
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
        numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
    })
  }
  return g.__pongsSql
}

const CREATE_TABLE = /^\s*CREATE TABLE IF NOT EXISTS\s+(\w+)/i

// A query that has not answered in this long is stuck (stalled pooler
// session, dropped socket). The pool is thrown away and rebuilt so one bad
// connection can never hang every later request.
const QUERY_TIMEOUT_MS = 20_000

function resetPool() {
  const old = g.__pongsSql
  g.__pongsSql = undefined
  old?.end({ timeout: 1 }).catch(() => {})
}

export const db: DbClient = {
  async execute(sql, args = []) {
    const conn = connection()
    const params = args.map(a => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a))
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        resetPool()
        reject(new Error(`Database query timed out after ${QUERY_TIMEOUT_MS / 1000}s`))
      }, QUERY_TIMEOUT_MS)
    })
    // One query per connection at a time: no pipelining through the
    // transaction pooler, which can mis-route pipelined statements.
    const run = (async () => {
      const reserved = await conn.reserve()
      try {
        const result = await reserved.unsafe(toPostgres(sql), params as (string | number | null)[])
        // Supabase exposes the public schema over its REST API. The app talks to
        // Postgres directly as the owner (which bypasses RLS), so every table gets
        // RLS switched on with no policies: unreachable through the anon key.
        const created = CREATE_TABLE.exec(sql)
        if (created) await reserved.unsafe(`ALTER TABLE ${created[1]} ENABLE ROW LEVEL SECURITY`)
        return { rows: Array.from(result) as Row[], rowsAffected: result.count ?? 0 }
      } finally {
        reserved.release()
      }
    })()
    try {
      return await Promise.race([run, timeout])
    } finally {
      clearTimeout(timer)
    }
  },
}
