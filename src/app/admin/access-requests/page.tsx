'use client'
import Gate from '@/components/Gate'
import { useEffect, useState, useCallback } from 'react'
import { Check, X, Inbox } from 'lucide-react'
import { PageHeader, Avatar, StatusBadge, EmptyState, LoadingRows, Modal, Field } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import { Select } from '@/components/controls'
import { toast } from '@/components/feedback'

type Request = {
  id: string; name: string; email: string; phone: string; city: string;
  requested_role: string; reason: string; status: string; created_at: string;
  reviewed_by: string; reviewed_at: string; notes: string;
}

const ROLES = ['viewer', 'sales', 'installer', 'manager', 'admin']
const FILTERS: [string, string][] = [['pending', 'Pending'], ['approved', 'Approved'], ['denied', 'Denied'], ['all', 'All']]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function AccessRequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [approving, setApproving] = useState<string | null>(null)
  const [roleOverride, setRoleOverride] = useState<Record<string, string>>({})
  const [denyModal, setDenyModal] = useState<Request | null>(null)
  const [denyNotes, setDenyNotes] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const q = filter === 'all' ? '' : `?status=${filter}`
    fetch(`/api/access-requests${q}`).then(r => r.json()).then(d => { setRequests(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
  }, [filter])

  useEffect(() => { load() }, [load])

  async function approve(req: Request) {
    setApproving(req.id)
    const role = roleOverride[req.id] ?? req.requested_role
    const res = await fetch(`/api/access-requests/${req.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', role }),
    })
    if (!res.ok) toast('Could not approve the request', { tone: 'error', description: 'Check that you are signed in as an administrator.' })
    else toast(`${req.name} now has access`)
    setApproving(null); load()
  }

  async function deny(req: Request) {
    const res = await fetch(`/api/access-requests/${req.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny', notes: denyNotes }),
    })
    if (!res.ok) toast('Could not deny the request', { tone: 'error', description: 'Check that you are signed in as an administrator.' })
    else toast('Request denied')
    setDenyModal(null); setDenyNotes(''); load()
  }

  return (
    <div className="page">
      <PageHeader title="Access requests" description="People asking to join the workspace. Approving creates their account." />

      <div className="segmented mb-4">
        {FILTERS.map(([v, l]) => <button key={v} data-active={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>

      <div className="card max-w-4xl">
        {loading ? <LoadingRows rows={3} cols={3} /> : requests.length === 0 ? (
          <EmptyState icon={Inbox} title={filter === 'pending' ? 'No requests waiting' : `No ${filter === 'all' ? '' : filter + ' '}requests`}
            description={filter === 'pending' ? 'New requests from the sign-in page appear here.' : undefined} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map(req => (
              <li key={req.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <Avatar name={req.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-gray-900">{req.name}</p>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-600">{[req.email, req.phone, req.city].filter(Boolean).join(' · ')}</p>
                  {req.reason && <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">{req.reason}</p>}
                  <p className="mt-2 text-xs text-gray-500">
                    Asked for <span className="font-medium text-gray-700">{cap(req.requested_role)}</span> access · {fmtDate(req.created_at)}
                    {req.reviewed_by && <> · Reviewed by {req.reviewed_by}{req.reviewed_at ? ` on ${fmtDate(req.reviewed_at)}` : ''}</>}
                  </p>
                  {req.notes && req.status === 'denied' && <p className="mt-1 text-xs text-gray-500">Reason: {req.notes}</p>}
                </div>

                {req.status === 'pending' && (
                  <div className="flex w-full flex-col gap-2 sm:w-48 shrink-0">
                    <div>
                      <span className="label">Grant access as</span>
                      <Select size="sm" ariaLabel="Grant access as"
                        value={roleOverride[req.id] ?? req.requested_role}
                        onChange={v => setRoleOverride(prev => ({ ...prev, [req.id]: v }))}
                        options={ROLES.map(r => ({ value: r, label: cap(r) }))} />
                    </div>
                    <button onClick={() => approve(req)} disabled={approving === req.id} className="btn-primary btn-sm w-full">
                      <Check size={14} /> {approving === req.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button onClick={() => { setDenyModal(req); setDenyNotes('') }} className="btn-secondary btn-sm w-full">
                      <X size={14} /> Deny
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {denyModal && (
        <Modal title="Deny access request" onClose={() => setDenyModal(null)} width="max-w-sm"
          footer={<>
            <button onClick={() => setDenyModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => deny(denyModal)} className="btn-destructive">Deny request</button>
          </>}>
          <p className="mb-4 text-[13px] text-gray-600"><span className="font-medium text-gray-900">{denyModal.name}</span> ({denyModal.email}) will not be given an account.</p>
          <Field label="Reason" hint="Optional. Kept with the request for your records.">
            <textarea value={denyNotes} onChange={e => setDenyNotes(e.target.value)} className="input resize-none" rows={3} />
          </Field>
        </Modal>
      )}
    </div>
  )
}

export default function AccessRequestsPageGuarded() {
  return <Gate admin><AccessRequestsPage /></Gate>
}
