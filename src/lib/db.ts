import { teamMembersList } from '@/lib/team'
import { db as pgClient, type InValue } from './pg'
import type { Quote } from './types'
import { fullPermissions, parsePermissions, permissionsForLegacyRole } from './permissions'
import { hashPassword } from './password'
import { calculateQuote } from './calculations'

function getClient() {
  return pgClient
}

// ---------------------------------------------------------------------------
// SCHEMA
// ---------------------------------------------------------------------------
// Migrations are idempotent but expensive (dozens of DDL statements and
// backfills, each a round trip, some taking table locks). They run once per
// SCHEMA_VERSION, not on every cold start: each server instance does a single
// version check and every init* call shares that one promise.
// Bump SCHEMA_VERSION whenever a migrate* function changes.
const SCHEMA_VERSION = 3

let _schema: Promise<void> | null = null

export function ensureSchema(force = false): Promise<void> {
  if (force) _schema = null
  _schema ??= (async () => {
    const db = getClient()
    const current = async () => {
      try {
        const r = await db.execute('SELECT version FROM app_schema WHERE id = 1')
        return Number(r.rows[0]?.version ?? 0) >= SCHEMA_VERSION
      } catch { return false /* table missing: fresh database */ }
    }
    if (!force && await current()) return
    try {
      await runMigrations()
    } catch (e) {
      // Right after a deploy several server instances can start at once and
      // migrate together. If another one finished first, that is success;
      // otherwise try once more now that the race has passed.
      await new Promise(r => setTimeout(r, 1500))
      if (await current()) return
      console.error('Schema migration failed once, retrying', e)
      await runMigrations()
    }
  })().catch(e => { _schema = null; throw e })
  return _schema
}

async function runMigrations() {
  const db = getClient()
  {
    await migrateInventoryTables()
    await migrateAuthTables()
    await migrateQuotesTable()
    await migrateProjectsTables()
    await migratePermissionsTables()
    await migrateClientsTable()
    await migratePaymentsTable()
    await migrateFollowupsTable()
    await migrateAuditLog()
    await db.execute('CREATE TABLE IF NOT EXISTS app_schema (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT)')
    await db.execute(
      `INSERT INTO app_schema (id, version, migrated_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, migrated_at = excluded.migrated_at`,
      [SCHEMA_VERSION, new Date().toISOString()],
    )
  }
}

// Change history for every business table, recorded by the database itself so
// no write path can skip it. The app tags each write transaction with the
// signed-in user, IP address and device (lib/actor.ts); changes made outside the
// app (SQL editor, scripts) are recorded as 'system'. Password hashes are never
// copied into the log.
export const AUDITED_EXCLUDE = ['audit_log', 'auth_sessions', 'user_activity_log', 'app_schema']

async function migrateAuditLog() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial primary key,
    at timestamptz not null default now(),
    txid bigint not null default txid_current(),
    actor text not null,
    ip text,
    user_agent text,
    table_name text not null,
    row_pk text not null,
    action text not null check (action in ('insert', 'update', 'delete')),
    old_data jsonb,
    new_data jsonb,
    restored_at timestamptz,
    restored_by text
  )`)
  // The record's own name (quote number, client, product…) from the full row,
  // so an edit that did not touch the name still says which record it was.
  await db.execute(`alter table audit_log add column if not exists label text`)
  await db.execute(`create index if not exists audit_log_at on audit_log (at desc)`)
  await db.execute(`create index if not exists audit_log_table_pk on audit_log (table_name, row_pk, at desc)`)
  await db.execute(`create index if not exists audit_log_actor on audit_log (actor, at desc)`)
  await db.execute(`create or replace function audit_row() returns trigger language plpgsql as $fn$
    declare
      who text := coalesce(nullif(current_setting('app.actor', true), ''), 'system');
      ip text := nullif(current_setting('app.ip', true), '');
      ua text := nullif(current_setting('app.ua', true), '');
      o jsonb; n jsonb; od jsonb; nd jsonb; f jsonb; lbl text;
    begin
      if tg_op <> 'INSERT' then o := to_jsonb(old) - 'password_hash'; end if;
      if tg_op <> 'DELETE' then n := to_jsonb(new) - 'password_hash'; end if;
      f := coalesce(n, o);
      lbl := coalesce(f ->> 'quote_number', f ->> 'purchase_number', f ->> 'name', f ->> 'project_name', f ->> 'product_name',
                      f ->> 'item', f ->> 'description', f ->> 'note', f ->> 'client_name', f ->> 'email');
      if lbl is not null and (f ->> 'client_name') is not null and lbl <> (f ->> 'client_name') then lbl := lbl || ' · ' || (f ->> 'client_name'); end if;
      if tg_op = 'INSERT' then
        insert into audit_log (actor, ip, user_agent, table_name, row_pk, action, new_data, label)
          values (who, ip, ua, tg_table_name, coalesce(n ->> 'id', ''), 'insert', n, lbl);
      elsif tg_op = 'DELETE' then
        insert into audit_log (actor, ip, user_agent, table_name, row_pk, action, old_data, label)
          values (who, ip, ua, tg_table_name, coalesce(o ->> 'id', ''), 'delete', o, lbl);
      else
        select jsonb_object_agg(k, o -> k), jsonb_object_agg(k, n -> k) into od, nd
          from jsonb_object_keys(n) k
          where (o -> k) is distinct from (n -> k) and k not in ('updated_at');
        if od is null then return null; end if;
        insert into audit_log (actor, ip, user_agent, table_name, row_pk, action, old_data, new_data, label)
          values (who, ip, ua, tg_table_name, coalesce(n ->> 'id', ''), 'update', od, nd, lbl);
      end if;
      return null;
    end $fn$`)
  // Attach to every table except the logs and sessions themselves.
  const tables = await db.execute(
    `select c.relname as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind = 'r'`)
  for (const r of tables.rows) {
    const t = String(r.t)
    if (AUDITED_EXCLUDE.includes(t) || !/^[a-z_][a-z0-9_]*$/.test(t)) continue
    await db.execute(`create or replace trigger audit after insert or update or delete on ${t} for each row execute function audit_row()`)
  }
}

// Kept as the public API every route already calls.
export const initQuotesTable = () => ensureSchema()
export const initInventoryTables = () => ensureSchema()
export const initProjectsTables = () => ensureSchema()
export const initPermissionsTables = () => ensureSchema()
export const initAuthTables = () => ensureSchema()
export const initClientsTable = () => ensureSchema()
export const initPaymentsTable = () => ensureSchema()
export const initFollowupsTable = () => ensureSchema()

async function migrateQuotesTable() {
  const db = getClient()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pongs_quotes (
      id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      project_name TEXT,
      location TEXT,
      date TEXT NOT NULL,
      valid_until TEXT,
      price_tier TEXT NOT NULL DEFAULT 'msp',
      markup_percent REAL DEFAULT 0,
      installation_rate REAL DEFAULT 120,
      transport_cost REAL DEFAULT 0,
      include_gst INTEGER DEFAULT 0,
      display_mode TEXT DEFAULT 'total',
      items_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      grand_total REAL DEFAULT 0,
      client_email TEXT,
      client_phone TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Migrate: add status column if it doesn't exist yet
  try {
    await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN status TEXT DEFAULT 'draft'`)
  } catch { /* already exists */ }
  try {
    await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN manual_rates_json TEXT`)
  } catch { /* already exists */ }
  // Migrate: ownership (RBAC) — every quote belongs to the user who created it
  try {
    await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN owner_email TEXT`)
  } catch { /* already exists */ }
  // Migrate: multi-company (STC / NLS) — which company the quote is issued from
  try {
    await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN company TEXT DEFAULT 'STC'`)
  } catch { /* already exists */ }
  // Backfill: any quote without a company defaults to STC
  await db.execute(`UPDATE pongs_quotes SET company = 'STC' WHERE company IS NULL OR company = ''`)
  // Backfill: legacy quotes with no owner are assigned to the seed admin so nothing
  // is orphaned and standard users never inherit historic quotes by accident.
  await db.execute(`UPDATE pongs_quotes SET owner_email = 'sidhanthrj@gmail.com' WHERE owner_email IS NULL OR owner_email = ''`)
  // Migrate: bump any quotes still using the old ₹60 default to ₹120
  await db.execute(`UPDATE pongs_quotes SET installation_rate = 120 WHERE installation_rate = 60`)
  // Migrate: quote revision trail. A quote is either an original (root_id = its
  // own id, parent_id NULL, revision 0) or a revision that points back to its
  // immediate parent and shares the root_id of the original.
  try { await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN parent_id TEXT`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN root_id TEXT`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN revision INTEGER DEFAULT 0`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN revised_by TEXT`) } catch { /* exists */ }
  // Manual (Custom) free-form rows (Feature 4)
  try { await db.execute(`ALTER TABLE pongs_quotes ADD COLUMN custom_lines_json TEXT`) } catch { /* exists */ }
  // Backfill: existing standalone quotes are their own root at revision 0.
  await db.execute(`UPDATE pongs_quotes SET root_id = id WHERE root_id IS NULL OR root_id = ''`)
  await db.execute(`UPDATE pongs_quotes SET revision = 0 WHERE revision IS NULL`)
  // Backfill: grand_total was never computed on save, so quotes created in the
  // app were stored at 0 and reports, client totals and converted projects
  // read 0. Recompute from the stored items wherever the total is missing.
  // Best effort: a malformed legacy row must never block the quotes module.
  try {
    const missing = await db.execute(`SELECT * FROM pongs_quotes WHERE grand_total IS NULL OR grand_total = 0`)
    for (const row of missing.rows) {
      try {
        const total = computeGrandTotal(rowToQuote(row))
        if (total > 0) await db.execute('UPDATE pongs_quotes SET grand_total = ? WHERE id = ?', [total, String(row.id)])
      } catch (e) {
        console.error('grand_total backfill skipped quote', String(row.id), e)
      }
    }
  } catch (e) {
    console.error('grand_total backfill failed', e)
  }
}

// Grand total from the quote's items using the same engine as the UI. Falls
// back to any total supplied by the caller (e.g. imported quotes with no items).
function computeGrandTotal(quote: Record<string, unknown>): number {
  try {
    const t = calculateQuote(quote as unknown as Quote).grandTotal
    if (Number.isFinite(t) && t > 0) return Math.round(t * 100) / 100
  } catch { /* incomplete quote — fall through */ }
  return Number(quote.grandTotal ?? 0)
}

// Ownership-aware listing. Pass ownerEmail=null for admins (all quotes),
// or a specific email for a standard user (only their own).
export async function dbListQuotesForUser(ownerEmail: string | null): Promise<Quote[]> {
  await initQuotesTable()
  const db = getClient()
  const result = ownerEmail === null
    ? await db.execute('SELECT * FROM pongs_quotes ORDER BY created_at DESC')
    : await db.execute('SELECT * FROM pongs_quotes WHERE owner_email = ? ORDER BY created_at DESC', [ownerEmail])
  return result.rows.map(rowToQuote) as unknown as Quote[]
}

export async function dbListQuotes(): Promise<Quote[]> {
  await initQuotesTable()
  const db = getClient()
  const result = await db.execute('SELECT * FROM pongs_quotes ORDER BY created_at DESC')
  return result.rows.map(rowToQuote) as unknown as Quote[]
}

export async function dbGetQuote(id: string): Promise<Quote | null> {
  await initQuotesTable()
  const db = getClient()
  const result = await db.execute(
    'SELECT * FROM pongs_quotes WHERE id = ?',
    [id],
  )
  if (!result.rows.length) return null
  return rowToQuote(result.rows[0]) as unknown as Quote
}

export async function dbSaveQuote(quote: Record<string, unknown>) {
  await initQuotesTable()
  const db = getClient()
  const now = new Date().toISOString()
  const args: InValue[] = [
    String(quote.id ?? ''),
    String(quote.quoteNumber ?? ''),
    String(quote.clientName ?? ''),
    (quote.projectName as string) ?? null,
    (quote.location as string) ?? null,
    String(quote.date ?? now),
    (quote.validUntil as string) ?? null,
    String(quote.priceTier ?? 'msp'),
    Number(quote.markupPercent ?? 0),
    Number(quote.installationRatePerSqft ?? quote.installationRate ?? 120),
    Number(quote.transportCost ?? 0),
    quote.includeGst ? 1 : 0,
    String(quote.displayMode ?? 'total'),
    JSON.stringify(quote.items ?? []),
    (quote.notes as string) ?? null,
    computeGrandTotal(quote),
    (quote.clientEmail as string) ?? null,
    (quote.clientPhone as string) ?? null,
    String((quote.status as string) ?? 'draft'),
    String(quote.createdAt ?? now),
    now,
    quote.manualRates ? JSON.stringify(quote.manualRates) : null,
    (quote.ownerEmail as string) ?? null,
    String(quote.company ?? 'STC'),
    (quote.parentId as string) ?? null,
    String(quote.rootId ?? quote.id ?? ''),
    Number(quote.revision ?? 0),
    (quote.revisedBy as string) ?? null,
    quote.customLines ? JSON.stringify(quote.customLines) : null,
  ]
  await db.execute(
    `INSERT INTO pongs_quotes (id, quote_number, client_name, project_name, location, date, valid_until,
      price_tier, markup_percent, installation_rate, transport_cost, include_gst, display_mode,
      items_json, notes, grand_total, client_email, client_phone, status, created_at, updated_at, manual_rates_json,
      owner_email, company, parent_id, root_id, revision, revised_by, custom_lines_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        client_name=excluded.client_name, project_name=excluded.project_name,
        location=excluded.location, date=excluded.date, valid_until=excluded.valid_until,
        price_tier=excluded.price_tier, markup_percent=excluded.markup_percent,
        installation_rate=excluded.installation_rate, transport_cost=excluded.transport_cost,
        include_gst=excluded.include_gst, display_mode=excluded.display_mode,
        items_json=excluded.items_json, notes=excluded.notes, grand_total=excluded.grand_total,
        client_email=excluded.client_email, client_phone=excluded.client_phone,
        status=excluded.status, updated_at=excluded.updated_at,
        manual_rates_json=excluded.manual_rates_json,
        company=excluded.company, custom_lines_json=excluded.custom_lines_json`,
    args,
  )
}

// ---------------------------------------------------------------------------
// QUOTE REVISION TRAIL
// ---------------------------------------------------------------------------

// Return every quote in the revision family of `id` (the original + all
// revisions), ordered oldest-first by revision number.
export async function dbListRevisions(id: string): Promise<Quote[]> {
  await initQuotesTable()
  const db = getClient()
  const base = await db.execute('SELECT root_id FROM pongs_quotes WHERE id = ?', [id])
  if (!base.rows.length) return []
  const rootId = String((base.rows[0] as Record<string, unknown>).root_id ?? id)
  const r = await db.execute(
    'SELECT * FROM pongs_quotes WHERE root_id = ? ORDER BY revision ASC, created_at ASC',
    [rootId],
  )
  return r.rows.map(rowToQuote) as unknown as Quote[]
}

// Create a new revision from an existing quote. The original is never mutated;
// a brand new row is inserted, linked to the source via parent_id and sharing
// the family's root_id. Returns the newly created revision quote.
export async function dbCreateRevision(
  sourceId: string,
  patch: Record<string, unknown>,
  revisedByEmail: string,
): Promise<Quote | null> {
  await initQuotesTable()
  const db = getClient()
  const source = await dbGetQuote(sourceId)
  if (!source) return null
  const s = source as unknown as Record<string, unknown>
  const rootId = String(s.rootId ?? s.id)
  // Highest revision number currently in the family.
  const maxR = await db.execute(
    'SELECT MAX(revision) as m FROM pongs_quotes WHERE root_id = ?',
    [rootId],
  )
  const nextRev = Number((maxR.rows[0] as Record<string, unknown>).m ?? 0) + 1
  const now = new Date().toISOString()
  const newId = crypto.randomUUID()
  const revised = {
    ...s,
    ...patch,
    id: newId,
    // Same visible quote number, suffixed with the revision marker.
    quoteNumber: `${String(s.quoteNumber ?? '').replace(/\s*-\s*R\d+$/i, '')} - R${nextRev}`,
    ownerEmail: s.ownerEmail, // ownership follows the original
    parentId: sourceId,
    rootId,
    revision: nextRev,
    revisedBy: revisedByEmail,
    createdAt: now,
    updatedAt: now,
  }
  await dbSaveQuote(revised)
  return (await dbGetQuote(newId)) as Quote
}

export async function dbDeleteQuote(id: string) {
  await initQuotesTable()
  const db = getClient()
  await db.execute('DELETE FROM pongs_quotes WHERE id = ?', [id])
}

export async function dbNextQuoteNumber() {
  await initQuotesTable()
  const db = getClient()
  const result = await db.execute('SELECT quote_number FROM pongs_quotes ORDER BY created_at DESC')
  let max = 0
  for (const row of result.rows) {
    const n = parseInt(String(row.quote_number).replace(/\D/g, '') || '0', 10)
    if (n > max) max = n
  }
  return `Q-${String(max + 1).padStart(4, '0')}`
}

export function getDbClient() {
  return getClient()
}

async function migrateInventoryTables() {
  const db = getClient()
  const tables = [
    `CREATE TABLE IF NOT EXISTS inv_products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, sku TEXT, unit TEXT DEFAULT 'nos',
      current_stock REAL DEFAULT 0, min_stock REAL DEFAULT 0,
      cost_price REAL DEFAULT 0, sell_price REAL DEFAULT 0,
      supplier_id TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inv_suppliers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT,
      email TEXT, phone TEXT, city TEXT, address TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inv_purchases (
      id TEXT PRIMARY KEY, purchase_number TEXT NOT NULL,
      supplier_id TEXT, supplier_name TEXT,
      purchase_date TEXT NOT NULL, total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'received', notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inv_purchase_items (
      id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL,
      product_id TEXT, description TEXT, category TEXT,
      quantity REAL DEFAULT 0, unit TEXT DEFAULT 'nos',
      unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS inv_movements (
      id TEXT PRIMARY KEY, product_id TEXT, product_name TEXT,
      movement_type TEXT NOT NULL, quantity REAL NOT NULL,
      reference_type TEXT, reference_id TEXT, notes TEXT,
      movement_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inv_work_completions (
      id TEXT PRIMARY KEY, project_name TEXT NOT NULL,
      client_name TEXT, location TEXT, completion_date TEXT,
      status TEXT DEFAULT 'completed', amount REAL DEFAULT 0,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT,
      city TEXT, access_level TEXT DEFAULT 'editor',
      bases TEXT DEFAULT '[]', status TEXT DEFAULT 'active',
      phone TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]
  for (const sql of tables) {
    await db.execute(sql)
  }
}

// ===========================================================================
// PROJECTS / JOBS MODULE
// ===========================================================================

// initProjectsTables is defined further below (canonical version).

export interface ProjectFilters {
  status?: string | null
  month?: string | null
  priority?: string | null
}

export async function dbListProjects(filters: ProjectFilters = {}) {
  await initProjectsTables()
  const db = getClient()
  let sql = 'SELECT * FROM projects WHERE 1=1'
  const args: InValue[] = []
  if (filters.status) { sql += ' AND status = ?'; args.push(filters.status) }
  if (filters.priority) { sql += ' AND priority = ?'; args.push(filters.priority) }
  if (filters.month) { sql += " AND substr(scheduled_date,1,7) = ?"; args.push(filters.month) }
  sql += ' ORDER BY scheduled_date ASC, created_at DESC'
  const result = args.length ? await db.execute(sql, args) : await db.execute(sql)
  return result.rows
}

export async function dbGetProject(id: string) {
  await initProjectsTables()
  const db = getClient()
  const proj = await db.execute('SELECT * FROM projects WHERE id = ?', [id])
  if (!proj.rows.length) return null
  const materials = await db.execute('SELECT * FROM project_materials WHERE project_id = ?', [id])
  const updates = await db.execute('SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC', [id])
  return { ...proj.rows[0], materials: materials.rows, updates: updates.rows }
}

function projectArgs(body: Record<string, unknown>): InValue[] {
  const tm = JSON.stringify(teamMembersList(body.team_members))
  return [
    body.name as string ?? '',
    body.client_name as string ?? '',
    (body.client_phone as string) ?? null,
    (body.client_email as string) ?? null,
    body.site_address as string ?? '',
    (body.city as string) ?? null,
    (body.quote_id as string) ?? null,
    (body.status as string) ?? 'scheduled',
    (body.scheduled_date as string) ?? null,
    (body.completion_date as string) ?? null,
    (body.team_lead as string) ?? null,
    tm,
    Number(body.ceiling_area_sqft ?? 0),
    Number(body.contract_value ?? 0),
    (body.notes as string) ?? null,
    (body.priority as string) ?? 'normal',
  ]
}

export async function dbCreateProject(body: Record<string, unknown>) {
  await initProjectsTables()
  const db = getClient()
  const id = (body.id as string) || crypto.randomUUID()
  await db.execute(
    `INSERT INTO projects (id, name, client_name, client_phone, client_email, site_address, city,
      quote_id, status, scheduled_date, completion_date, team_lead, team_members,
      ceiling_area_sqft, contract_value, notes, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, ...projectArgs(body)],
  )
  const r = await db.execute('SELECT * FROM projects WHERE id = ?', [id])
  return r.rows[0]
}

export async function dbUpdateProject(id: string, body: Record<string, unknown>) {
  await initProjectsTables()
  const db = getClient()
  await db.execute(
    `UPDATE projects SET name=?, client_name=?, client_phone=?, client_email=?, site_address=?, city=?,
      quote_id=?, status=?, scheduled_date=?, completion_date=?, team_lead=?, team_members=?,
      ceiling_area_sqft=?, contract_value=?, notes=?, priority=?, updated_at=datetime('now') WHERE id=?`,
    [...projectArgs(body), id],
  )
  const r = await db.execute('SELECT * FROM projects WHERE id = ?', [id])
  return r.rows[0]
}

export async function dbDeleteProject(id: string) {
  await initProjectsTables()
  const db = getClient()
  await db.execute('DELETE FROM projects WHERE id = ?', [id])
  await db.execute('DELETE FROM project_materials WHERE project_id = ?', [id])
  await db.execute('DELETE FROM project_updates WHERE project_id = ?', [id])
}

export async function dbAddProjectUpdate(projectId: string, body: Record<string, unknown>) {
  await initProjectsTables()
  const db = getClient()
  const id = crypto.randomUUID()
  await db.execute(
    `INSERT INTO project_updates (id, project_id, note, status, created_by) VALUES (?,?,?,?,?)`,
    [id, projectId, (body.note as string) ?? '', (body.status as string) ?? null, (body.created_by as string) ?? null],
  )
  if (body.status) {
    await db.execute(`UPDATE projects SET status=?, updated_at=datetime('now') WHERE id=?`, [body.status as string, projectId])
  }
  const r = await db.execute('SELECT * FROM project_updates WHERE id = ?', [id])
  return r.rows[0]
}

export async function dbListProjectUpdates(projectId: string) {
  await initProjectsTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC', [projectId])
  return r.rows
}

export async function dbProjectStats() {
  await initProjectsTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM projects')
  const rows = r.rows as unknown as Record<string, unknown>[]
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)

  const byStatus: Record<string, number> = {}
  let totalActive = 0, scheduledThisWeek = 0, completedThisMonth = 0, invoicedThisMonthValue = 0
  let pipelineValue = 0
  const pipelineByStatus: Record<string, number> = {}

  for (const p of rows) {
    const status = String(p.status ?? 'scheduled')
    byStatus[status] = (byStatus[status] ?? 0) + 1
    const sd = String(p.scheduled_date ?? '')
    const cd = String(p.completion_date ?? '')
    const value = Number(p.contract_value ?? 0)
    pipelineByStatus[status] = (pipelineByStatus[status] ?? 0) + value
    if (status !== 'completed' && status !== 'invoiced' && status !== 'cancelled') {
      totalActive++
      pipelineValue += value
    }
    if (sd && sd >= today && sd <= weekEnd) scheduledThisWeek++
    if (status === 'completed' && cd.startsWith(thisMonth)) completedThisMonth++
    if (status === 'invoiced' && (cd.startsWith(thisMonth) || sd.startsWith(thisMonth))) invoicedThisMonthValue += value
  }

  return { byStatus, totalActive, scheduledThisWeek, completedThisMonth, invoicedThisMonthValue, pipelineValue, pipelineByStatus, today, weekEnd }
}

// ===========================================================================
// ANALYTICS
// ===========================================================================

export async function dbQuoteAnalytics() {
  await initQuotesTable()
  const db = getClient()
  const r = await db.execute('SELECT date, grand_total, status, client_name FROM pongs_quotes')
  const rows = r.rows as unknown as Record<string, unknown>[]
  const byMonthMap: Record<string, { count: number; value: number }> = {}
  const statusBreakdown: Record<string, number> = { draft: 0, sent: 0, approved: 0, rejected: 0 }
  for (const q of rows) {
    const month = String(q.date ?? '').slice(0, 7)
    if (month) {
      byMonthMap[month] = byMonthMap[month] ?? { count: 0, value: 0 }
      byMonthMap[month].count++
      byMonthMap[month].value += Number(q.grand_total ?? 0)
    }
    const st = String(q.status ?? 'draft')
    statusBreakdown[st] = (statusBreakdown[st] ?? 0) + 1
  }
  const byMonth = Object.entries(byMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, v]) => ({ month, count: v.count, value: v.value }))
  return { byMonth, statusBreakdown }
}

export async function dbTopClients() {
  await initQuotesTable()
  const db = getClient()
  const r = await db.execute('SELECT client_name, grand_total, date FROM pongs_quotes')
  const rows = r.rows as unknown as Record<string, unknown>[]
  const map: Record<string, { count: number; value: number; lastDate: string }> = {}
  for (const q of rows) {
    const name = String(q.client_name ?? 'Unknown')
    map[name] = map[name] ?? { count: 0, value: 0, lastDate: '' }
    map[name].count++
    map[name].value += Number(q.grand_total ?? 0)
    const d = String(q.date ?? '')
    if (d > map[name].lastDate) map[name].lastDate = d
  }
  return Object.entries(map)
    .map(([client, v]) => ({ client, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
}

export async function dbInventoryValue() {
  await initInventoryTables()
  const db = getClient()
  const r = await db.execute('SELECT category, current_stock, cost_price FROM inv_products')
  const rows = r.rows as unknown as Record<string, unknown>[]
  const byCategory: Record<string, number> = {}
  let total = 0
  for (const p of rows) {
    const cat = String(p.category ?? 'Uncategorized')
    const val = Number(p.current_stock ?? 0) * Number(p.cost_price ?? 0)
    byCategory[cat] = (byCategory[cat] ?? 0) + val
    total += val
  }
  return { total, byCategory: Object.entries(byCategory).map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value) }
}

export async function dbTopConsumedProducts() {
  await initInventoryTables()
  const db = getClient()
  const r = await db.execute("SELECT product_name, quantity FROM inv_movements WHERE movement_type = 'OUT'")
  const rows = r.rows as unknown as Record<string, unknown>[]
  const map: Record<string, number> = {}
  for (const m of rows) {
    const name = String(m.product_name ?? 'Unknown')
    map[name] = (map[name] ?? 0) + Number(m.quantity ?? 0)
  }
  return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5)
}

export async function dbLowStockProducts() {
  await initInventoryTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM inv_products WHERE current_stock <= min_stock AND min_stock > 0 ORDER BY (current_stock - min_stock) ASC')
  return r.rows
}

export async function dbListProducts(category?: string | null) {
  await initInventoryTables()
  const db = getClient()
  const r = category
    ? await db.execute('SELECT * FROM inv_products WHERE category = ? ORDER BY name', [category])
    : await db.execute('SELECT * FROM inv_products ORDER BY name')
  return r.rows
}

export async function dbGetProduct(id: string) {
  await initInventoryTables()
  const db = getClient()
  const p = await db.execute('SELECT * FROM inv_products WHERE id = ?', [id])
  if (!p.rows.length) return null
  const movements = await db.execute('SELECT * FROM inv_movements WHERE product_id = ? ORDER BY movement_date ASC', [id])
  return { ...p.rows[0], movements: movements.rows }
}

export async function dbProjectPipelineStats() {
  return dbProjectStats()
}

// ===========================================================================
// ROLE PERMISSIONS + USER ACTIVITY
// ===========================================================================

// Matrix: each feature has a default per role. We model View + Manage/Edit
// as separate can_view / can_edit flags per (role, feature) pair.
export const PERMISSION_ROLES = ['admin', 'manager', 'sales', 'installer', 'viewer']
export const PERMISSION_FEATURES = ['quotes', 'inventory', 'projects', 'analytics', 'users']
// initPermissionsTables is defined further below (canonical version).

export async function dbListPermissions() {
  await initPermissionsTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM role_permissions ORDER BY role, feature')
  return r.rows
}

export async function dbLogActivity(userId: string | null, action: string, details?: string) {
  await initPermissionsTables()
  const db = getClient()
  await db.execute(
    'INSERT INTO user_activity_log (id, user_id, action, details) VALUES (?,?,?,?)',
    [crypto.randomUUID(), userId, action, details ?? null],
  )
}

export async function dbListActivity(limit = 100) {
  await initPermissionsTables()
  const db = getClient()
  const r = await db.execute(
    `SELECT a.id, a.user_id, a.action, a.details, a.created_at,
            COALESCE(u.name, a.user_name) as user_name
     FROM user_activity_log a
     LEFT JOIN app_users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT ?`,
    [limit],
  )
  return r.rows
}

export async function dbListUsers(filters: { city?: string | null; status?: string | null; access_level?: string | null } = {}) {
  await initInventoryTables()
  const db = getClient()
  let sql = 'SELECT * FROM app_users WHERE 1=1'
  const args: InValue[] = []
  if (filters.city) { sql += ' AND city = ?'; args.push(filters.city) }
  if (filters.status) { sql += ' AND status = ?'; args.push(filters.status) }
  if (filters.access_level) { sql += ' AND access_level = ?'; args.push(filters.access_level) }
  sql += ' ORDER BY name'
  const r = args.length ? await db.execute(sql, args) : await db.execute(sql)
  return r.rows
}

export async function dbGetUser(id: string) {
  await initInventoryTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM app_users WHERE id = ?', [id])
  return r.rows[0] ?? null
}

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================

export async function dbNotificationCounts() {
  await initInventoryTables()
  await initProjectsTables()
  const db = getClient()
  const lowStock = await db.execute('SELECT id, name, current_stock, min_stock FROM inv_products WHERE current_stock <= min_stock AND min_stock > 0')
  const today = new Date().toISOString().slice(0, 10)
  const todayJobs = await db.execute('SELECT id, name, client_name, team_lead FROM projects WHERE scheduled_date = ?', [today])
  return {
    lowStockCount: lowStock.rows.length,
    todayJobsCount: todayJobs.rows.length,
    lowStock: lowStock.rows,
    todayJobs: todayJobs.rows,
    total: lowStock.rows.length + todayJobs.rows.length,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToQuote(row: any): Record<string, unknown> {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    clientName: row.client_name,
    projectName: row.project_name,
    location: row.location,
    date: row.date,
    validUntil: row.valid_until,
    priceTier: row.price_tier,
    markupPercent: row.markup_percent,
    installationRatePerSqft: row.installation_rate,
    transportCost: row.transport_cost,
    includeGst: !!row.include_gst,
    displayMode: row.display_mode ?? 'total',
    items: JSON.parse(row.items_json ?? '[]'),
    notes: row.notes,
    grandTotal: row.grand_total,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    status: row.status ?? 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    manualRates: row.manual_rates_json ? JSON.parse(row.manual_rates_json as string) : undefined,
    ownerEmail: row.owner_email ?? undefined,
    company: row.company ?? 'STC',
    parentId: row.parent_id ?? undefined,
    rootId: row.root_id ?? row.id,
    revision: Number(row.revision ?? 0),
    revisedBy: row.revised_by ?? undefined,
    customLines: row.custom_lines_json ? JSON.parse(row.custom_lines_json as string) : undefined,
  }
}

async function migrateProjectsTables() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, client_name TEXT NOT NULL,
    client_phone TEXT, client_email TEXT, site_address TEXT, city TEXT,
    quote_id TEXT, status TEXT DEFAULT 'scheduled',
    scheduled_date TEXT, completion_date TEXT,
    team_lead TEXT, team_members TEXT DEFAULT '[]',
    ceiling_area_sqft REAL DEFAULT 0, contract_value REAL DEFAULT 0,
    priority TEXT DEFAULT 'normal', notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS project_materials (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
    product_id TEXT, description TEXT NOT NULL,
    qty REAL NOT NULL, unit TEXT DEFAULT 'pcs', notes TEXT
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS project_updates (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
    note TEXT NOT NULL, status TEXT, created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
}

const DEFAULT_PERMISSIONS = [
  { feature: 'quotes',     view: { admin:1, manager:1, sales:1, installer:0, viewer:1 }, edit: { admin:1, manager:1, sales:1, installer:0, viewer:0 } },
  { feature: 'inventory',  view: { admin:1, manager:1, sales:0, installer:0, viewer:0 }, edit: { admin:1, manager:1, sales:0, installer:0, viewer:0 } },
  { feature: 'projects',   view: { admin:1, manager:1, sales:1, installer:1, viewer:1 }, edit: { admin:1, manager:1, sales:0, installer:1, viewer:0 } },
  { feature: 'analytics',  view: { admin:1, manager:1, sales:0, installer:0, viewer:0 }, edit: { admin:1, manager:1, sales:0, installer:0, viewer:0 } },
  { feature: 'users',      view: { admin:1, manager:1, sales:0, installer:0, viewer:0 }, edit: { admin:1, manager:0, sales:0, installer:0, viewer:0 } },
]

async function migratePermissionsTables() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY, role TEXT NOT NULL, feature TEXT NOT NULL,
    can_view INTEGER DEFAULT 0, can_edit INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(role, feature)
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS user_activity_log (
    id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
    details TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)
  // Migrate: user_name is read by dbListActivity as a fallback for log rows
  // whose user has since been deleted; fresh databases never had the column.
  try { await db.execute(`ALTER TABLE user_activity_log ADD COLUMN user_name TEXT`) } catch { /* exists */ }
  const existing = await db.execute('SELECT COUNT(*) as c FROM role_permissions')
  if (Number((existing.rows[0] as Record<string,unknown>).c) === 0) {
    for (const { feature, view, edit } of DEFAULT_PERMISSIONS) {
      for (const role of ['admin','manager','sales','installer','viewer']) {
        await db.execute(
          'INSERT INTO role_permissions (id, role, feature, can_view, can_edit) VALUES (?,?,?,?,?)',
          [crypto.randomUUID(), role, feature, (view as Record<string,number>)[role]??0, (edit as Record<string,number>)[role]??0]
        )
      }
    }
  }
}

// ===========================================================================
// AUTH + ACCESS REQUESTS
// ===========================================================================

async function migrateAuthTables() {
  // app_users is created by the inventory migration — it must exist before we
  // migrate/seed it (matters on a fresh database).
  await migrateInventoryTables()
  const db = getClient()
  // Add role column to app_users if missing
  try { await db.execute(`ALTER TABLE app_users ADD COLUMN role TEXT DEFAULT 'viewer'`) } catch {}
  try { await db.execute(`ALTER TABLE app_users ADD COLUMN password_hash TEXT`) } catch {}
  // Granular, user-specific permissions (JSON blob). NULL for legacy rows;
  // backfilled below from the coarse role so nobody loses access on migration.
  try { await db.execute(`ALTER TABLE app_users ADD COLUMN permissions_json TEXT`) } catch {}

  // Seed admin user
  const admin = await db.execute(`SELECT id FROM app_users WHERE email = 'sidhanthrj@gmail.com'`)
  if (!admin.rows.length) {
    await db.execute(
      `INSERT INTO app_users (id, name, email, role, access_level, status) VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), 'Sidhant', 'sidhanthrj@gmail.com', 'admin', 'admin', 'active']
    )
  } else {
    await db.execute(`UPDATE app_users SET role='admin', access_level='admin', status='active' WHERE email='sidhanthrj@gmail.com'`)
  }

  // --- ROOT-CAUSE FIX for "newly created admins are not admins" ---------------
  // Historically the user-create form wrote only `access_level`, leaving `role`
  // at its 'viewer' default. Authorization keys off `role`, so those accounts
  // silently became non-admins. Reconcile the two columns so role is the single
  // source of truth and any account marked admin via access_level really is one.
  await db.execute(`UPDATE app_users SET role='admin' WHERE access_level='admin' AND (role IS NULL OR role != 'admin')`)
  await db.execute(`UPDATE app_users SET access_level='admin' WHERE role='admin' AND (access_level IS NULL OR access_level != 'admin')`)

  // Backfill granular permissions for any existing user that predates the model.
  // Derived from the legacy role so current access is preserved exactly.
  await backfillUserPermissions()

  await db.execute(`CREATE TABLE IF NOT EXISTS access_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    city TEXT,
    requested_role TEXT DEFAULT 'viewer',
    reason TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`)

}

// Seed permissions_json for any user that doesn't have it yet, derived from the
// coarse legacy role. Idempotent: only touches rows where permissions_json IS NULL.
async function backfillUserPermissions() {
  const db = getClient()
  const rows = (await db.execute(
    `SELECT id, role, access_level FROM app_users WHERE permissions_json IS NULL`
  )).rows as unknown as Record<string, unknown>[]
  for (const u of rows) {
    const role = String(u.role ?? u.access_level ?? 'viewer')
    const perms = permissionsForLegacyRole(role)
    await db.execute(`UPDATE app_users SET permissions_json = ? WHERE id = ?`, [
      JSON.stringify(perms),
      String(u.id),
    ])
  }
}

// ---------------------------------------------------------------------------
// USER MANAGEMENT (admin-only writes — authorization enforced in the API layer)
// ---------------------------------------------------------------------------

// Normalises a create/update payload into the columns we persist. Crucially,
// `role` and `access_level` are kept in lock-step and `permissions_json` is
// always derived server-side — the client can never smuggle in a role.
function normaliseUserWrite(body: Record<string, unknown>) {
  const isAdmin = body.role === 'admin' || body.access_level === 'admin' || body.is_admin === true
  const role = isAdmin ? 'admin' : (String(body.role ?? body.access_level ?? 'viewer') || 'viewer')
  const accessLevel = role
  // Admins get a full set implicitly; otherwise take the explicit granular map
  // (or, if none supplied, fall back to the legacy-role defaults).
  const perms = isAdmin
    ? fullPermissions()
    : (body.permissions
        ? parsePermissions(body.permissions)
        : permissionsForLegacyRole(role))
  return { role, accessLevel, permissionsJson: JSON.stringify(perms) }
}

export async function dbCreateUser(body: Record<string, unknown>) {
  await initInventoryTables()
  await initAuthTables()
  const db = getClient()
  const id = (body.id as string) || crypto.randomUUID()
  const bases = Array.isArray(body.bases) ? JSON.stringify(body.bases) : ((body.bases as string) ?? '[]')
  const { role, accessLevel, permissionsJson } = normaliseUserWrite(body)
  // Optional password set at creation time by an admin.
  const pw = typeof body.password === 'string' && body.password ? String(body.password) : null
  const passwordHash = pw ? await hashPassword(pw) : null
  await db.execute(
    `INSERT INTO app_users (id, name, email, city, access_level, role, permissions_json, bases, status, phone, notes, password_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, (body.name as string) ?? '', (body.email as string) ?? null, (body.city as string) ?? null,
     accessLevel, role, permissionsJson, bases, (body.status as string) ?? 'active',
     (body.phone as string) ?? null, (body.notes as string) ?? null, passwordHash],
  )
  const r = await db.execute('SELECT * FROM app_users WHERE id = ?', [id])
  return r.rows[0]
}

export async function dbUpdateUser(id: string, body: Record<string, unknown>) {
  await initInventoryTables()
  await initAuthTables()
  const db = getClient()
  const bases = Array.isArray(body.bases) ? JSON.stringify(body.bases) : ((body.bases as string) ?? '[]')
  const { role, accessLevel, permissionsJson } = normaliseUserWrite(body)
  await db.execute(
    `UPDATE app_users SET name=?, email=?, city=?, access_level=?, role=?, permissions_json=?,
       bases=?, status=?, phone=?, notes=? WHERE id=?`,
    [(body.name as string) ?? '', (body.email as string) ?? null, (body.city as string) ?? null,
     accessLevel, role, permissionsJson, bases, (body.status as string) ?? 'active',
     (body.phone as string) ?? null, (body.notes as string) ?? null, id],
  )
  // A blank password on edit leaves the existing one untouched; a non-blank
  // value resets it. Handled separately so we never clobber a hash by accident.
  if (typeof body.password === 'string' && body.password) {
    await dbSetUserPassword(id, String(body.password))
  }
  const r = await db.execute('SELECT * FROM app_users WHERE id = ?', [id])
  return r.rows[0]
}

// Set (or reset) a user's password. Stores a scrypt hash — never plaintext.
export async function dbSetUserPassword(userId: string, password: string) {
  await initAuthTables()
  const db = getClient()
  const hash = await hashPassword(password)
  await db.execute('UPDATE app_users SET password_hash = ? WHERE id = ?', [hash, userId])
}

export async function dbDeleteUser(id: string) {
  await initInventoryTables()
  const db = getClient()
  await db.execute('DELETE FROM app_users WHERE id = ?', [id])
}

export async function dbListAccessRequests(status?: string) {
  await initAuthTables()
  const db = getClient()
  if (status) {
    const r = await db.execute('SELECT * FROM access_requests WHERE status = ? ORDER BY created_at DESC', [status])
    return r.rows
  }
  const r = await db.execute('SELECT * FROM access_requests ORDER BY created_at DESC')
  return r.rows
}

export async function dbApproveAccessRequest(id: string, approverEmail: string, role: string) {
  await initAuthTables()
  const db = getClient()
  const req = await db.execute('SELECT * FROM access_requests WHERE id = ?', [id])
  if (!req.rows[0]) throw new Error('Request not found')
  const r = req.rows[0] as Record<string, unknown>

  // Create or update user
  const existing = await db.execute('SELECT id FROM app_users WHERE email = ?', [r.email as string])
  const now = new Date().toISOString()
  if (existing.rows.length) {
    await db.execute(
      `UPDATE app_users SET name=?, role=?, access_level=?, status='active', city=? WHERE email=?`,
      [String(r.name), role, role, r.city ? String(r.city) : null, String(r.email)]
    )
  } else {
    await db.execute(
      `INSERT INTO app_users (id, name, email, phone, city, role, access_level, status) VALUES (?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), String(r.name), String(r.email), r.phone ? String(r.phone) : null, r.city ? String(r.city) : null, role, role, 'active']
    )
  }
  await db.execute(
    `UPDATE access_requests SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?`,
    [approverEmail, now, id]
  )
}

export async function dbDenyAccessRequest(id: string, approverEmail: string, notes?: string) {
  await initAuthTables()
  const db = getClient()
  const now = new Date().toISOString()
  await db.execute(
    `UPDATE access_requests SET status='denied', reviewed_by=?, reviewed_at=?, notes=? WHERE id=?`,
    [approverEmail, now, notes ?? null, id]
  )
}

export async function dbGetUserByEmail(email: string) {
  await initAuthTables()
  const db = getClient()
  const r = await db.execute('SELECT * FROM app_users WHERE email = ? AND status = ?', [email, 'active'])
  return r.rows[0] ?? null
}

export async function dbCreateSession(userId: string) {
  await initAuthTables()
  const db = getClient()
  const id = crypto.randomUUID()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.execute('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?,?,?)', [id, userId, expires])
  return id
}

export async function dbGetSession(sessionId: string) {
  await initAuthTables()
  const db = getClient()
  const now = new Date().toISOString()
  const r = await db.execute(
    `SELECT s.*, u.name, u.email, u.role, u.access_level, u.status, u.permissions_json FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, now]
  )
  return r.rows[0] ?? null
}

// ===========================================================================
// CLIENTS MODULE
// ===========================================================================
async function migrateClientsTable() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    address TEXT,
    gst_number TEXT,
    source TEXT DEFAULT 'direct',
    status TEXT DEFAULT 'active',
    notes TEXT,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
}

// ===========================================================================
// PAYMENTS MODULE
// ===========================================================================
async function migratePaymentsTable() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS project_payments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT DEFAULT 'payment',
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT DEFAULT 'bank_transfer',
    reference TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS project_expenses (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT DEFAULT 'materials',
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL,
    paid_to TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS project_checklists (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    item TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    done_by TEXT,
    done_at TEXT,
    sort_order INTEGER DEFAULT 0
  )`)
}

export async function dbSeedProjectChecklist(projectId: string) {
  await initPaymentsTable()
  const db = getClient()
  const existing = await db.execute('SELECT COUNT(*) as c FROM project_checklists WHERE project_id = ?', [projectId])
  if (Number((existing.rows[0] as Record<string, unknown>).c) > 0) return
  const items = [
    // [phase, item, sort]
    ['pre-install', 'Site survey completed', 0],
    ['pre-install', 'Measurements verified', 1],
    ['pre-install', 'Materials ordered/confirmed', 2],
    ['pre-install', 'Client sign-off on design', 3],
    ['pre-install', 'Team briefed', 4],
    ['install', 'Gripper track fixed', 0],
    ['install', 'Fabric stretched and fixed', 1],
    ['install', 'LED strips installed', 2],
    ['install', 'Drivers wired and tested', 3],
    ['install', 'Lighting tested', 4],
    ['install', 'Site cleaned', 5],
    ['post-install', 'Client walkthrough done', 0],
    ['post-install', 'Snag list addressed', 1],
    ['post-install', 'Photos taken', 2],
    ['post-install', 'Warranty card handed over', 3],
    ['post-install', 'Invoice raised', 4],
    ['post-install', 'Payment collected', 5],
  ]
  for (const [phase, item, sort] of items) {
    await db.execute(
      'INSERT INTO project_checklists (id, project_id, phase, item, sort_order) VALUES (?,?,?,?,?)',
      [crypto.randomUUID(), projectId, phase, item, sort]
    )
  }
}

// ===========================================================================
// FOLLOW-UPS
// ===========================================================================
async function migrateFollowupsTable() {
  const db = getClient()
  await db.execute(`CREATE TABLE IF NOT EXISTS follow_ups (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    due_date TEXT NOT NULL,
    note TEXT,
    done INTEGER DEFAULT 0,
    done_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
}

// The project created from a quote (via "Convert to project"), if any.
export async function dbGetProjectIdForQuote(quoteId: string): Promise<string | null> {
  await initProjectsTables()
  const db = getClient()
  const r = await db.execute('SELECT id FROM projects WHERE quote_id = ? ORDER BY created_at ASC LIMIT 1', [quoteId])
  return r.rows.length ? String((r.rows[0] as Record<string, unknown>).id) : null
}
