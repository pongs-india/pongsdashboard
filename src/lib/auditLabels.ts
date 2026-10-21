// Plain names for audit log record types and fields.

export const TABLE_LABEL: Record<string, string> = {
  pongs_quotes: 'Quote', clients: 'Client', projects: 'Project', project_payments: 'Payment',
  project_expenses: 'Expense', project_checklists: 'Checklist item', project_updates: 'Project update',
  project_materials: 'Project material', follow_ups: 'Follow-up', inv_products: 'Product', inv_suppliers: 'Supplier',
  inv_purchases: 'Purchase order', inv_purchase_items: 'Purchase line', inv_movements: 'Stock movement',
  inv_work_completions: 'Work completion', app_users: 'User', access_requests: 'Access request', role_permissions: 'Role permission',
}

export const ACTION_LABEL: Record<string, string> = { insert: 'Created', update: 'Edited', delete: 'Deleted' }

const FIELD: Record<string, string> = {
  quote_number: 'Quote number', client_name: 'Client', project_name: 'Project', grand_total: 'Grand total',
  price_tier: 'Price list', markup_percent: 'Markup %', installation_rate: 'Installation rate', transport_cost: 'Transport',
  include_gst: 'GST', items_json: 'Items', custom_lines_json: 'Custom lines', manual_rates_json: 'Manual rates',
  owner_email: 'Owner', valid_until: 'Valid until', contract_value: 'Contract value', ceiling_area_sqft: 'Ceiling area (sqft)',
  scheduled_date: 'Scheduled', completion_date: 'Completed', team_lead: 'Team lead', team_members: 'Team',
  site_address: 'Site address', current_stock: 'In stock', min_stock: 'Minimum stock', cost_price: 'Cost price',
  sell_price: 'Sell price', supplier_id: 'Supplier', supplier_name: 'Supplier', purchase_date: 'Purchase date',
  total_amount: 'Total', movement_type: 'Movement', reference_type: 'Reference', permissions_json: 'Permissions',
  access_level: 'Access', gst_number: 'GSTIN', payment_date: 'Payment date', expense_date: 'Expense date',
  paid_to: 'Paid to', due_date: 'Due date', can_view: 'Can view', can_edit: 'Can edit', done_by: 'Done by', done_at: 'Done at',
  created_at: 'Created', updated_at: 'Updated', root_id: 'Original quote', parent_id: 'Revised from', revised_by: 'Revised by',
}

export function fieldLabel(k: string) {
  return FIELD[k] ?? k.replace(/_json$/, '').replace(/_id$/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

/** A value as one readable line. Long JSON is summarised rather than dumped. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.length === 0 ? 'None' : `${v.length} ${v.length === 1 ? 'entry' : 'entries'}`
    return JSON.stringify(v).slice(0, 160)
  }
  const s = String(v)
  if (/^\s*[[{]/.test(s)) {
    try { const j = JSON.parse(s); if (Array.isArray(j)) return j.length === 0 ? 'None' : `${j.length} ${j.length === 1 ? 'entry' : 'entries'}` } catch { /* plain text */ }
  }
  return s.length > 160 ? s.slice(0, 157) + '…' : s
}

/** "Chrome on Mac": enough to tell devices apart without the raw user-agent string. */
export function deviceOf(ua: string | null | undefined) {
  if (!ua) return null
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown system'
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  return `${br} on ${os}`
}

/** Deletions can be restored for this many days. */
export const UNDO_DAYS = 30
