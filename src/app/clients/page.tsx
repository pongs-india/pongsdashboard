'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Users2 } from 'lucide-react'
import Gate from '@/components/Gate'
import { useNewParam } from '@/lib/useNewParam'
import { PageHeader, EmptyState, LoadingRows, SearchInput, Badge, Avatar, Stat, StatGrid } from '@/components/ui'
import ClientFormModal, { EMPTY_CLIENT, CLIENT_STATUSES, CLIENT_STATUS_LABEL, SOURCE_LABEL, type ClientForm } from '@/components/ClientFormModal'
import { fmtINR } from '@/lib/format'
import { confirmDialog, toast } from '@/components/feedback'
import { navigate } from '@/lib/navigate'
import { useSort, SortHeader, usePagination, Pagination, downloadCsv, ExportButton, useUrlState } from '@/components/table'

interface Client extends ClientForm {
  id: string
  created_at: string
  quote_count: number
  total_value: number
}

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'accent' | 'danger'> = { active: 'success', inactive: 'neutral', vip: 'accent', blacklisted: 'danger' }

function ClientsPageInner() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useUrlState('q', '')
  const [statusFilter, setStatusFilter] = useUrlState('status', 'all')
  const [editing, setEditing] = useState<{ id?: string; form: ClientForm } | null>(null)
  useNewParam(() => setEditing({ form: { ...EMPTY_CLIENT } }))
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/clients')
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || `The server returned ${r.status}.`)
      setClients(Array.isArray(data) ? data : [])
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not reach the server.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (c: Client) => setEditing({
    id: c.id,
    form: { name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '', city: c.city || '', address: c.address || '', gst_number: c.gst_number || '', source: c.source || 'direct', status: c.status || 'active', notes: c.notes || '' },
  })

  const del = async (c: Client) => {
    const ok = await confirmDialog({ title: 'Delete client', body: `${c.name} will be removed from Clients. Their quotes and projects are not affected.`, confirmLabel: 'Delete client', tone: 'danger' })
    if (!ok) return
    setDeleting(c.id)
    const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) toast('Client deleted'); else toast('Could not delete the client', { tone: 'error' })
    load()
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q) || c.city?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })
  const { sorted, sort, toggle } = useSort(filtered, {
    name: c => c.company || c.name,
    city: c => c.city,
    status: c => CLIENT_STATUS_LABEL[c.status] ?? c.status,
    quotes: c => Number(c.quote_count || 0),
    value: c => Number(c.total_value || 0),
  }, { key: 'name', dir: 'asc' })
  const pager = usePagination(sorted, 25)
  const exportCsv = () => downloadCsv('pongs-clients',
    ['Name', 'Company', 'Email', 'Phone', 'City', 'GST number', 'Source', 'Status', 'Quotes', 'Quoted value (INR)'],
    sorted.map(c => [c.name, c.company, c.email, c.phone, c.city, c.gst_number, SOURCE_LABEL[c.source] ?? c.source, CLIENT_STATUS_LABEL[c.status] ?? c.status, Number(c.quote_count || 0), Math.round(Number(c.total_value || 0))]))
  const totalValue = clients.reduce((s, c) => s + Number(c.total_value || 0), 0)
  const withQuotes = clients.filter(c => Number(c.quote_count) > 0).length
  const top = [...clients].sort((a, b) => Number(b.total_value || 0) - Number(a.total_value || 0))[0]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clients"
        description="Architects, builders and homeowners you quote and install for."
        actions={<>
          <ExportButton onClick={exportCsv} disabled={loading || sorted.length === 0} />
          <button onClick={() => setEditing({ form: { ...EMPTY_CLIENT } })} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add client</button>
        </>}
      />

      <StatGrid cols={3}>
        <Stat label="Clients" value={loading ? null : clients.length} hint={`${clients.filter(c => c.status === 'vip').length} VIP`} />
        <Stat label="Quoted to clients" value={loading ? null : fmtINR(totalValue)} hint={`${withQuotes} client${withQuotes !== 1 ? 's' : ''} with quotes`} />
        <Stat label="Largest account" value={loading ? null : top && Number(top.total_value) > 0 ? fmtINR(top.total_value) : '—'} hint={top && Number(top.total_value) > 0 ? (top.company || top.name) : 'No quotes yet'} />
      </StatGrid>

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button type="button" className="chip" aria-pressed={statusFilter === 'all'} data-active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All <span className="tabular-nums opacity-60">{clients.length}</span></button>
            {CLIENT_STATUSES.map(s => (
              <button key={s} type="button" className="chip" aria-pressed={statusFilter === s} data-active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
                {CLIENT_STATUS_LABEL[s]} <span className="tabular-nums opacity-60">{clients.filter(c => c.status === s).length}</span>
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, company, phone, city" />
        </div>

        {loading ? <LoadingRows rows={6} cols={5} /> : loadError ? (
          <div className="p-5"><div className="alert-error" role="alert"><span><span className="font-medium">Clients could not be loaded.</span> {loadError} <button type="button" onClick={load} className="font-medium underline underline-offset-2">Retry</button></span></div></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users2} title={clients.length ? 'No clients match' : 'No clients yet'}
            description={clients.length ? 'Try another search or status.' : 'Add the people and companies you work with.'}
            action={!clients.length ? <button onClick={() => setEditing({ form: { ...EMPTY_CLIENT } })} className="btn-primary"><Plus size={15} /> Add client</button> : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <SortHeader label="Client" sortKey="name" sort={sort} onSort={toggle} />
                  <th className="hidden lg:table-cell">Contact</th>
                  <SortHeader label="City" sortKey="city" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                  <th className="hidden xl:table-cell">Source</th>
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                  <SortHeader label="Quotes" sortKey="quotes" sort={sort} onSort={toggle} align="right" className="hidden sm:table-cell" />
                  <SortHeader label="Quoted value" sortKey="value" sort={sort} onSort={toggle} align="right" />
                  <th className="w-20"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map(c => (
                  <tr key={c.id} className={`cursor-pointer ${deleting === c.id ? 'opacity-50' : ''}`} onClick={e => {
                    if ((e.target as HTMLElement).closest('button,a')) return
                    navigate(`/clients/${c.id}`, e)
                  }}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.company || c.name} size={30} />
                        <div className="min-w-0">
                          <a href={`/clients/${c.id}`} className="block truncate font-medium text-gray-900 hover:underline">{c.company || c.name}</a>
                          {c.company && <div className="truncate text-xs text-gray-500">{c.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell">
                      <div className="text-gray-700">{c.phone || '—'}</div>
                      {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                    </td>
                    <td className="hidden md:table-cell">{c.city || '—'}</td>
                    <td className="hidden xl:table-cell">{SOURCE_LABEL[c.source] ?? c.source ?? '—'}</td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{CLIENT_STATUS_LABEL[c.status] ?? c.status}</Badge></td>
                    <td className="num hidden sm:table-cell">{c.quote_count || 0}</td>
                    <td className="num font-medium text-gray-900">{Number(c.total_value) ? fmtINR(c.total_value) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => openEdit(c)} className="btn-ghost btn-icon" aria-label={`Edit ${c.name}`}><Pencil size={14} /></button>
                      <button onClick={() => del(c)} disabled={deleting === c.id} className="btn-ghost btn-icon text-gray-500 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${c.name}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && filtered.length > 0 && <Pagination {...pager} noun="clients" summary={`${fmtINR(filtered.reduce((s, c) => s + Number(c.total_value || 0), 0))} quoted`} />}
      </div>

      {editing && (
        <ClientFormModal id={editing.id} initial={editing.form} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

export default function ClientsPage() {
  return <Gate module="clients"><ClientsPageInner /></Gate>
}
