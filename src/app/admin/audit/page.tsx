'use client'

import { Fragment, useCallback, useEffect, useId, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronRight as Chevron, RotateCcw, ScrollText } from 'lucide-react'
import Gate from '@/components/Gate'
import { PageHeader, EmptyState } from '@/components/ui'
import { ExportMenu, fmtDateTime } from '@/components/DataTable'
import { useFilters, FilterSelect, DateRange, FilterBar } from '@/components/filters'
import { confirmDialog, toast } from '@/components/feedback'
import { TABLE_LABEL, ACTION_LABEL, UNDO_DAYS, fieldLabel, showValue, deviceOf } from '@/lib/auditLabels'

type Entry = {
  id: number; at: string; actor: string; ip: string | null; user_agent: string | null
  table_name: string; row_pk: string; action: 'insert' | 'update' | 'delete'; label: string | null
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null
  restored_at: string | null; restored_by: string | null; restorable: boolean
}

const PAGE = 50
// Column layout shared by the header row and every entry. On phones the cells stack.
const COLS = 'sm:grid sm:grid-cols-[11.5rem_6.5rem_minmax(0,1fr)_14rem_6.5rem_1.25rem] sm:items-start sm:gap-x-4'
const DOT: Record<string, string> = { insert: 'bg-success-fill', update: 'bg-line-hover', delete: 'bg-danger-fill' }

const nameOf = (d: Record<string, unknown> | null) =>
  d ? (d.quote_number ?? d.name ?? d.client_name ?? d.purchase_number ?? d.product_name ?? d.description ?? d.email ?? d.item) as string | undefined : undefined

function AuditLog() {
  const f = useFilters({ tab: 'all', table: '', action: '', actor: '', record: '', from: '', to: '' })
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ total: number; rows: Entry[]; actors: string[] } | null>(null)
  const [error, setError] = useState('')
  const v = f.values

  const query = useCallback((extra: Record<string, string | number> = {}) => {
    const p = new URLSearchParams()
    for (const [k, val] of Object.entries({ ...v, page, limit: PAGE, ...extra })) if (val !== '' && val !== 'all') p.set(k, String(val))
    return `/api/audit?${p}`
  }, [v, page])

  const load = useCallback(() => {
    setError('')
    fetch(query()).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`)
      setData(d)
    }).catch(e => setError(e instanceof Error ? e.message : 'Could not reach the server.'))
  }, [query])

  // The record search waits for typing to pause.
  useEffect(() => { const t = setTimeout(load, v.record ? 300 : 0); return () => clearTimeout(t) }, [load, v.record])
  useEffect(() => { setPage(0) }, [v.tab, v.table, v.action, v.actor, v.record, v.from, v.to])

  async function restore(e: Entry) {
    const ok = await confirmDialog({ title: 'Restore this record?', body: `${TABLE_LABEL[e.table_name] ?? e.table_name} ${e.label ?? nameOf(e.old_data) ?? e.row_pk} goes back into its list exactly as it was before it was deleted.`, confirmLabel: 'Restore' })
    if (!ok) return
    const r = await fetch(`/api/audit/${e.id}/restore`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast(d.error ?? 'Could not restore the record', { tone: 'error' }); return }
    toast('Record restored')
    load()
  }

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const anyFilter = !!(v.table || v.action || v.actor || v.record || v.from || v.to)

  const exportInput = () => ({
    title: v.tab === 'deleted' ? 'Audit log, deleted records' : 'Audit log',
    cols: [
      { key: 'at', label: 'When', kind: 'datetime' as const }, { key: 'change', label: 'Change' }, { key: 'type', label: 'Record type' },
      { key: 'row_pk', label: 'Record id' }, { key: 'name', label: 'Record' }, { key: 'fields', label: 'Fields changed' },
      { key: 'actor', label: 'By' }, { key: 'ip', label: 'IP address' }, { key: 'device', label: 'Device' },
    ],
    rows: (data?.rows ?? []).map(e => ({
      at: e.at, change: ACTION_LABEL[e.action], type: TABLE_LABEL[e.table_name] ?? e.table_name, row_pk: e.row_pk,
      name: e.label ?? nameOf(e.new_data) ?? nameOf(e.old_data) ?? '',
      fields: e.action === 'update' ? Object.keys(e.new_data ?? {}).map(k => `${fieldLabel(k)}: ${showValue(e.old_data?.[k])} → ${showValue(e.new_data?.[k])}`).join('; ') : '',
      actor: e.actor === 'system' ? 'System change' : e.actor, ip: e.ip ?? '', device: deviceOf(e.user_agent) ?? '',
    })),
    note: total > PAGE ? `Page ${page + 1} of ${pages}` : undefined,
  })

  return (
    <div className="page">
      <PageHeader title="Audit log" description={`Every change to quotes, clients, projects, inventory and users: who made it, when and from where. Deleted records can be restored for ${UNDO_DAYS} days.`} />

      <div className="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={v.tab !== 'deleted'} data-active={v.tab !== 'deleted'} onClick={() => f.set({ tab: 'all' })}>All changes</button>
        <button type="button" aria-pressed={v.tab === 'deleted'} data-active={v.tab === 'deleted'} onClick={() => f.set({ tab: 'deleted', action: '' })}>Deleted</button>
      </div>

      <FilterBar active={anyFilter} onClear={() => f.set({ table: '', action: '', actor: '', record: '', from: '', to: '' })}>
        <FilterSelect value={v.table} onChange={x => f.set({ table: x })} all="All record types" className="w-full sm:w-48"
          options={Object.entries(TABLE_LABEL).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))} />
        {v.tab !== 'deleted' && <FilterSelect value={v.action} onChange={x => f.set({ action: x })} all="Any change" className="w-full sm:w-40"
          options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))} />}
        <FilterSelect value={v.actor} onChange={x => f.set({ actor: x })} all="Changed by anyone" className="w-full sm:w-60"
          options={(data?.actors ?? []).map(a => ({ value: a, label: a === 'system' ? 'System change' : a }))} />
        <input value={v.record} onChange={e => f.set({ record: e.target.value })} className="input input-sm w-full sm:w-52"
          placeholder="Record id, name or number" aria-label="Find a record" />
        <DateRange label="Changed" from={v.from} to={v.to} onChange={(from, to) => f.set({ from, to })} className="w-full sm:w-auto" />
      </FilterBar>

      <div className="card overflow-hidden">
        <div className="card-head">
          <h2 className="card-title">{v.tab === 'deleted' ? 'Deleted records' : 'Changes'}</h2>
          {data && <span className="count">{total.toLocaleString('en-IN')} {total === 1 ? 'entry' : 'entries'}</span>}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-faint md:inline">Click a row for every detail</span>
            <ExportMenu input={exportInput} disabled={!data || data.rows.length === 0} />
          </div>
        </div>

        {error ? (
          <div className="p-4"><div className="alert-error" role="alert"><span><span className="font-medium">The audit log could not be loaded.</span> {error} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div></div>
        ) : !data ? (
          <div className="divide-y divide-line" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`px-4 py-3.5 ${COLS}`}><div className="skeleton h-3 w-32" /><div className="skeleton h-3 w-16" /><div className="skeleton h-3 w-3/4" /><div className="skeleton h-3 w-40" /></div>
            ))}
          </div>
        ) : data.rows.length ? (
          <>
            <div className={`hidden border-b border-line bg-surface-alt px-4 py-2 text-[12px] font-medium text-faint sm:grid ${COLS}`}>
              <span>When</span><span>Change</span><span>Record</span><span className="text-right">By</span><span className="text-right">Restore</span><span />
            </div>
            <div className="divide-y divide-line">{data.rows.map(e => <Row key={e.id} e={e} onRestore={() => restore(e)} />)}</div>
          </>
        ) : anyFilter ? (
          <EmptyState title="No changes match these filters" description="Changes exist, but the filters hide them."
            action={<button type="button" className="btn-secondary btn-sm" onClick={() => f.set({ table: '', action: '', actor: '', record: '', from: '', to: '' })}>Clear filters</button>} />
        ) : (
          <EmptyState icon={ScrollText} title={v.tab === 'deleted' ? 'Nothing has been deleted yet' : 'No changes recorded yet'}
            description={v.tab === 'deleted' ? undefined : 'Every save, edit and delete from now on appears here.'} />
        )}

        {data && total > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[12px] text-muted">
            <span className="tabular-nums">{(page * PAGE + 1).toLocaleString('en-IN')}–{Math.min((page + 1) * PAGE, total).toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span>
            {pages > 1 && (
              <nav className="ml-auto flex items-center gap-1" aria-label="Pagination">
                <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={page === 0} onClick={() => setPage(0)} aria-label="First page"><ChevronsLeft size={14} /></button>
                <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
                <span className="px-2 tabular-nums">Page {page + 1} of {pages}</span>
                <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
                <button type="button" className="btn-secondary btn-sm !w-8 !px-0" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page"><ChevronsRight size={14} /></button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ e, onRestore }: { e: Entry; onRestore: () => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const label = TABLE_LABEL[e.table_name] ?? e.table_name
  const title = e.label ?? nameOf(e.new_data) ?? nameOf(e.old_data)
  const changes = e.action === 'update' ? Object.keys(e.new_data ?? {}).map(k => ({ k, from: e.old_data?.[k], to: e.new_data?.[k] })) : []
  const details = e.action === 'delete' ? e.old_data : e.action === 'insert' ? e.new_data : null
  const device = deviceOf(e.user_agent)

  const restore = e.action !== 'delete' ? null
    : e.restored_at ? <span className="badge-info" title={`Restored ${fmtDateTime(e.restored_at)} by ${e.restored_by}`}>Restored</span>
    : e.restorable ? <button type="button" className="btn-secondary btn-xs" onClick={onRestore}><RotateCcw size={12} /> Restore</button>
    : <span className="text-[12px] text-faint" title={`Deleted more than ${UNDO_DAYS} days ago`}>Too old</span>

  return (
    <div className={open ? 'bg-surface-alt/60' : ''}>
      <div className={`relative px-4 py-3 text-[13px] transition-colors hover:bg-hover ${COLS}`}>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
          className="absolute inset-0 cursor-pointer focus-visible:outline-offset-[-2px]" aria-label={open ? 'Hide details' : 'Show details'} />
        <div className="pointer-events-none tabular-nums text-faint"><time dateTime={e.at}>{fmtDateTime(e.at)}</time></div>
        <div className="pointer-events-none mt-0.5 sm:mt-0"><span className="inline-flex items-center gap-1.5"><span className={`dot ${DOT[e.action]}`} />{ACTION_LABEL[e.action]}</span></div>
        <div className="pointer-events-none mt-0.5 min-w-0 break-words sm:mt-0">
          <span className="font-medium">{label}</span>{title ? <span className="text-muted"> · {title}</span> : <span className="font-mono text-[12px] text-faint"> {e.row_pk}</span>}
          {changes.length > 0 && (
            <span className="block truncate text-faint">
              {changes.slice(0, 2).map(c => `${fieldLabel(c.k)} ${showValue(c.from)} → ${showValue(c.to)}`).join(', ')}
              {changes.length > 2 ? `, and ${changes.length - 2} more` : ''}
            </span>
          )}
        </div>
        <div className="pointer-events-none mt-0.5 min-w-0 break-words text-faint sm:mt-0 sm:text-right">{e.actor === 'system' ? 'System change' : e.actor.replace(/\s*<.*>$/, '')}{e.ip && <span className="block font-mono text-[11px]">{e.ip}</span>}</div>
        <div className="relative z-10 mt-2 sm:mt-0 sm:text-right">{restore}</div>
        <Chevron size={15} className={`pointer-events-none absolute right-4 top-3.5 text-faint transition-transform sm:static sm:mt-0.5 ${open ? 'rotate-90 text-ink' : ''}`} />
      </div>
      {open && (
        <div id={id} className="px-4 pb-4 sm:pl-[calc(11.5rem+2rem)] sm:pr-[calc(1.25rem+2rem)]">
          <div className="max-h-[26rem] space-y-3 overflow-y-auto rounded-lg border border-line bg-white p-3 text-[12px] [overflow-wrap:anywhere]">
            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="text-faint">Record</dt><dd>{label} <span className="font-mono">{e.row_pk}</span></dd>
              <dt className="text-faint">When</dt><dd>{fmtDateTime(e.at)} IST</dd>
              <dt className="text-faint">By</dt><dd>{e.actor === 'system' ? 'System change (outside the app)' : e.actor}</dd>
              <dt className="text-faint">IP address</dt><dd className={e.ip ? 'font-mono' : 'text-faint'}>{e.ip ?? 'Not recorded'}</dd>
              {device && <><dt className="text-faint">Device</dt><dd>{device}</dd></>}
              {e.restored_at && <><dt className="text-faint">Restored</dt><dd>{fmtDateTime(e.restored_at)} by {e.restored_by}</dd></>}
            </dl>
            {changes.length > 0 && (
              <table className="w-full table-fixed border-t border-line">
                <thead className="text-left text-faint"><tr><th className="w-[30%] py-1.5 pr-3 font-medium">Field</th><th className="py-1.5 pr-3 font-medium">Before</th><th className="py-1.5 font-medium">After</th></tr></thead>
                <tbody>{changes.map(c => (
                  <tr key={c.k} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3 text-muted">{fieldLabel(c.k)}</td>
                    <td className="py-1.5 pr-3 text-danger line-through decoration-danger/40">{showValue(c.from)}</td>
                    <td className="py-1.5 text-success">{showValue(c.to)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {details && (
              <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line pt-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                {Object.entries(details).filter(([k, val]) => val !== null && val !== '' && k !== 'id').map(([k, val]) => (
                  <Fragment key={k}><dt className="text-faint">{fieldLabel(k)}</dt><dd>{showValue(val)}</dd></Fragment>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  return <Gate admin><AuditLog /></Gate>
}
