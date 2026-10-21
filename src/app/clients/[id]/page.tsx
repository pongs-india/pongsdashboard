'use client'
import DocumentTitle from '@/components/DocumentTitle'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Pencil, FileText, HardHat, Users2, Plus } from 'lucide-react'
import { Badge, StatusBadge, EmptyState, PageLoading, Avatar } from '@/components/ui'
import ClientFormModal, { CLIENT_STATUS_LABEL, SOURCE_LABEL, type ClientForm } from '@/components/ClientFormModal'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtINR, fmtDate } from '@/lib/format'
import { navigate } from '@/lib/navigate'

interface Client extends ClientForm { id: string; created_at: string }
// Shapes returned by GET /api/clients/[id]
interface QuoteRow { id: string; quote_number: string; project_name: string; date: string; grand_total: number; status: string }
interface ProjectRow { id: string; name: string; status: string; scheduled_date: string; ceiling_area_sqft: number; contract_value: number }

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'accent' | 'danger'> = { active: 'success', inactive: 'neutral', vip: 'accent', blacklisted: 'danger' }

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${id}`)
    if (!r.ok) { setClient(null); setLoading(false); return }
    // The API returns the client's own fields at the top level, plus its
    // quotes and projects.
    const { quotes: q, projects: p, ...c } = await r.json()
    setClient(c as Client)
    setQuotes(q || [])
    setProjects(p || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <PageLoading />
  if (!client) {
    return (
      <div className="card mt-8">
        <EmptyState icon={Users2} title="Client not found" description="It may have been deleted, or you may not have access."
          action={<a href="/clients" className="btn-secondary">All clients</a>} />
      </div>
    )
  }

  const quoted = quotes.reduce((s, q) => s + Number(q.grand_total || 0), 0)
  const won = quotes.filter(q => q.status === 'approved').reduce((s, q) => s + Number(q.grand_total || 0), 0)
  const contracted = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0)
  const display = client.company || client.name
  const newQuoteHref = `/quotes/new`

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={display} size={48} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DocumentTitle title={String(display)} />
              <h1 className="text-xl sm:text-[22px] font-semibold tracking-tight text-gray-900">{display}</h1>
              <Badge tone={STATUS_TONE[client.status] ?? 'neutral'}>{CLIENT_STATUS_LABEL[client.status] ?? client.status}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">
              {[client.company ? client.name : null, client.city, `Client since ${fmtDate(client.created_at)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a href={newQuoteHref} className="btn-secondary"><Plus size={14} /> New quote</a>
          <button onClick={() => setEditing(true)} className="btn-primary"><Pencil size={14} /> Edit client</button>
        </div>
      </div>

      <section className="card mb-6">
        <dl className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <Metric label="Quotes" value={String(quotes.length)} hint={`${quotes.filter(q => q.status === 'approved').length} approved`} />
          <Metric label="Quoted value" value={fmtINR(quoted)} />
          <Metric label="Won" value={fmtINR(won)} hint={quoted ? `${Math.round((won / quoted) * 100)}% of quoted value` : undefined} />
          <Metric label="Contracted projects" value={fmtINR(contracted)} hint={`${projects.length} project${projects.length !== 1 ? 's' : ''}`} />
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <section className="table-wrap">
            <div className="card-header">
              <h2 className="card-title">Quotes</h2>
              <span className="text-xs text-gray-500">{quotes.length}</span>
            </div>
            {quotes.length === 0 ? (
              <EmptyState icon={FileText} title="No quotes for this client" description={`Quotes whose client is "${client.name}"${client.company ? ` or "${client.company}"` : ''} appear here.`}
                action={<a href="/quotes/new" className="btn-secondary btn-sm">New quote</a>} compact />
            ) : (
              <div className="table-scroll">
                <table className="table table-hover">
                  <thead><tr><th>Quote</th><th className="hidden sm:table-cell">Project</th><th className="hidden md:table-cell">Date</th><th>Status</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {quotes.map(q => (
                      <tr key={q.id} className="cursor-pointer" onClick={e => navigate(`/quotes/${q.id}/team`, e)}>
                        <td><a href={`/quotes/${q.id}/team`} className="mono text-xs font-medium text-gray-900 hover:underline">{q.quote_number}</a></td>
                        <td className="hidden sm:table-cell">{q.project_name || '—'}</td>
                        <td className="hidden md:table-cell whitespace-nowrap tabular-nums">{fmtDate(q.date)}</td>
                        <td><StatusBadge status={q.status} /></td>
                        <td className="num font-medium text-gray-900">{Number(q.grand_total) ? fmtINR(Number(q.grand_total)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="table-wrap">
            <div className="card-header">
              <h2 className="card-title">Projects</h2>
              <span className="text-xs text-gray-500">{projects.length}</span>
            </div>
            {projects.length === 0 ? (
              <EmptyState icon={HardHat} title="No projects for this client" description="When one of their quotes is approved, convert it into a project from the quote." compact />
            ) : (
              <div className="table-scroll">
                <table className="table table-hover">
                  <thead><tr><th>Project</th><th className="hidden md:table-cell">Scheduled</th><th>Status</th><th className="num hidden sm:table-cell">Area</th><th className="num">Value</th></tr></thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={p.id} className="cursor-pointer" onClick={e => navigate(`/projects/${p.id}`, e)}>
                        <td><a href={`/projects/${p.id}`} className="font-medium text-gray-900 hover:underline">{p.name}</a></td>
                        <td className="hidden md:table-cell whitespace-nowrap tabular-nums">{fmtDate(p.scheduled_date)}</td>
                        <td><StatusBadge status={p.status} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                        <td className="num hidden sm:table-cell">{p.ceiling_area_sqft ? `${p.ceiling_area_sqft} sqft` : '—'}</td>
                        <td className="num font-medium text-gray-900">{Number(p.contract_value) ? fmtINR(Number(p.contract_value)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="card self-start">
          <div className="card-header"><h2 className="card-title">Contact details</h2></div>
          <dl className="space-y-4 p-5 text-[13px]">
            <Detail label="Contact">{client.name}</Detail>
            <Detail label="Phone">{client.phone ? <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a> : '—'}</Detail>
            <Detail label="Email">{client.email ? <a href={`mailto:${client.email}`} className="break-all hover:underline">{client.email}</a> : '—'}</Detail>
            <Detail label="Address">{[client.address, client.city].filter(Boolean).join(', ') || '—'}</Detail>
            <Detail label="GSTIN">{client.gst_number ? <span className="mono">{client.gst_number}</span> : '—'}</Detail>
            <Detail label="Source">{SOURCE_LABEL[client.source] ?? client.source ?? '—'}</Detail>
            {client.notes && <Detail label="Notes"><span className="whitespace-pre-line">{client.notes}</span></Detail>}
          </dl>
        </aside>
      </div>

      {editing && (
        <ClientFormModal id={client.id}
          initial={{ name: client.name, company: client.company || '', email: client.email || '', phone: client.phone || '', city: client.city || '', address: client.address || '', gst_number: client.gst_number || '', source: client.source || 'direct', status: client.status || 'active', notes: client.notes || '' }}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      )}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight text-gray-900 tabular-nums">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-gray-500">{hint}</dd>}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900">{children}</dd>
    </div>
  )
}
