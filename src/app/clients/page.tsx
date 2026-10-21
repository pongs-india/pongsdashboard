'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Users2 } from 'lucide-react'
import Gate from '@/components/Gate'
import { useNewParam } from '@/lib/useNewParam'
import { PageHeader, Badge, Avatar, Stat, StatGrid } from '@/components/ui'
import ClientFormModal, { EMPTY_CLIENT, CLIENT_STATUSES, CLIENT_STATUS_LABEL, SOURCE_LABEL, type ClientForm } from '@/components/ClientFormModal'
import { fmtINR } from '@/lib/format'
import { confirmDialog, toast } from '@/components/feedback'
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, optionsFrom } from '@/components/filters'

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
  const [editing, setEditing] = useState<{ id?: string; form: ClientForm } | null>(null)
  useNewParam(() => setEditing({ form: { ...EMPTY_CLIENT } }))
  const f = useFilters({ status: '', source: '', city: '', quoted: '' })
  const v = f.values

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
    const ok = await confirmDialog({ title: 'Delete client', body: `${c.name} will be removed from Clients. Their quotes and projects are not affected, and an administrator can restore the client from the audit log for 30 days.`, confirmLabel: 'Delete client', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' })
    if (res.ok) toast('Client deleted'); else toast('Could not delete the client', { tone: 'error' })
    load()
  }

  const rows = useMemo(() => clients.filter(c =>
    (!v.status || c.status === v.status) && (!v.source || c.source === v.source) && (!v.city || c.city === v.city) &&
    (!v.quoted || (v.quoted === 'yes' ? Number(c.quote_count) > 0 : Number(c.quote_count) === 0))), [clients, v])
  const totalValue = rows.reduce((s, c) => s + Number(c.total_value || 0), 0)
  const withQuotes = rows.filter(c => Number(c.quote_count) > 0).length
  const top = [...rows].sort((a, b) => Number(b.total_value || 0) - Number(a.total_value || 0))[0]

  const cols: Col[] = [
    { key: 'name', label: 'Client', value: r => String(r.company || r.name), render: r => (
      <div className="flex items-center gap-3">
        <Avatar name={String(r.company || r.name)} size={30} />
        <div className="min-w-0">
          <a href={`/clients/${r.id}`} className="block truncate">{String(r.company || r.name)}</a>
          {r.company ? <div className="truncate text-[12px] text-faint">{String(r.name)}</div> : null}
        </div>
      </div>
    ) },
    { key: 'phone', label: 'Phone', hideBelow: 'lg', sub: { key: 'email', label: 'Email' } },
    { key: 'city', label: 'City', hideBelow: 'md' },
    { key: 'source', label: 'Source', hideBelow: 'xl', value: r => SOURCE_LABEL[String(r.source)] ?? String(r.source ?? '') },
    { key: 'gst_number', label: 'GSTIN', hideBelow: 'xl', kind: 'mono' },
    { key: 'status', label: 'Status', value: r => CLIENT_STATUS_LABEL[String(r.status)] ?? String(r.status ?? ''),
      render: r => <Badge tone={STATUS_TONE[String(r.status)] ?? 'neutral'}>{CLIENT_STATUS_LABEL[String(r.status)] ?? String(r.status)}</Badge> },
    { key: 'quote_count', label: 'Quotes', kind: 'int', hideBelow: 'sm', total: true },
    { key: 'total_value', label: 'Quoted value', kind: 'money', total: true },
  ]

  const active = !!(v.status || v.source || v.city || v.quoted)

  return (
    <div className="page">
      <PageHeader
        title="Clients"
        description="Architects, builders and homeowners you quote and install for."
        actions={<button onClick={() => setEditing({ form: { ...EMPTY_CLIENT } })} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add client</button>}
      />

      <StatGrid cols={4}>
        <Stat label="Clients" value={loading ? null : rows.length} hint={loading ? undefined : `${rows.filter(c => c.status === 'vip').length} VIP · ${rows.filter(c => c.status === 'active').length} active`} />
        <Stat label="Quoted to clients" value={loading ? null : fmtINR(totalValue)} hint={loading ? undefined : `${withQuotes} client${withQuotes !== 1 ? 's' : ''} with quotes`} />
        <Stat label="Average per quoted client" value={loading ? null : withQuotes ? fmtINR(Math.round(totalValue / withQuotes)) : '—'} hint={loading ? undefined : 'Total quoted ÷ clients quoted'} />
        <Stat label="Largest account" value={loading ? null : top && Number(top.total_value) > 0 ? fmtINR(top.total_value) : '—'} hint={loading ? undefined : top && Number(top.total_value) > 0 ? (top.company || top.name) : 'No quotes yet'} />
      </StatGrid>

      <DataTable
        title="All clients"
        exportTitle="Clients"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/clients/${r.id}`}
        initialSort={{ key: 'name', dir: 1 }}
        searchPlaceholder="Search name, phone, city"
        rowActions={r => [
          { icon: 'open', label: `Open ${r.name}`, href: `/clients/${r.id}` },
          { icon: 'edit', label: `Edit ${r.name}`, onClick: () => openEdit(r as unknown as Client) },
          { icon: 'trash', label: `Delete ${r.name}`, tone: 'danger', onClick: () => del(r as unknown as Client) },
        ]}
        filters={<>
          <FilterSelect value={v.status} onChange={x => f.set({ status: x })} all="All statuses" options={CLIENT_STATUSES.map(s => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))} />
          <FilterSelect value={v.source} onChange={x => f.set({ source: x })} all="All sources" options={optionsFrom(clients, c => c.source, s => SOURCE_LABEL[s] ?? s)} />
          <FilterSelect value={v.city} onChange={x => f.set({ city: x })} all="All cities" options={optionsFrom(clients, c => c.city)} />
          <FilterSelect value={v.quoted} onChange={x => f.set({ quoted: x })} all="Quoted or not" className="w-full sm:w-40"
            options={[{ value: 'yes', label: 'Has quotes' }, { value: 'no', label: 'No quotes yet' }]} />
        </>}
        filtersActive={active}
        onClearFilters={f.clear}
        note={[v.status && CLIENT_STATUS_LABEL[v.status], v.source && (SOURCE_LABEL[v.source] ?? v.source), v.city, v.quoted && (v.quoted === 'yes' ? 'Has quotes' : 'No quotes yet')].filter(Boolean).join(' · ') || undefined}
        empty={{ icon: Users2, title: 'No clients yet', description: 'Add the people and companies you work with.',
          action: <button onClick={() => setEditing({ form: { ...EMPTY_CLIENT } })} className="btn-primary btn-sm"><Plus size={14} /> Add client</button> }}
        summary={visible => `${fmtINR(visible.reduce((s, c) => s + Number(c.total_value || 0), 0))} quoted`}
      />

      {editing && (
        <ClientFormModal id={editing.id} initial={editing.form} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

export default function ClientsPage() {
  return <Gate module="clients"><ClientsPageInner /></Gate>
}
