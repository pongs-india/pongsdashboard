'use client'
import Gate from '@/components/Gate'
import { useEffect, useState } from 'react'
import { DatabaseZap, Inbox, Plus } from 'lucide-react'
import { PageHeader, Stat, StatGrid, Avatar, Badge, EmptyState, PageLoading } from '@/components/ui'
import { MODULES, MODULE_LABELS, parsePermissions } from '@/lib/permissions'

interface User {
  id: string; name: string; email: string; phone: string; city: string
  access_level: string; role: string; status: string; created_at: string; permissions_json?: string; has_password?: boolean
}
type Req = { id: string; name: string; email: string; requested_role: string; created_at: string }

function UsersDashboard() {
  const [users, setUsers] = useState<User[]>([])
  const [requests, setRequests] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/access-requests?status=pending').then(r => r.json()).catch(() => []),
    ]).then(([u, r]) => { setUsers(Array.isArray(u) ? u : []); setRequests(Array.isArray(r) ? r : []); setLoading(false) })
  }, [])

  if (loading) return <PageLoading />

  const isAdmin = (u: User) => (u.role ?? u.access_level) === 'admin'
  const active = users.filter(u => u.status === 'active')
  const admins = users.filter(isAdmin)
  const noPassword = active.filter(u => !u.has_password)
  // How many active users can open each module (admins can open all).
  const moduleReach = MODULES.map(m => ({
    m,
    n: active.filter(u => isAdmin(u) || parsePermissions(u.permissions_json)[m]?.view).length,
  }))
  const byCity: Record<string, number> = {}
  for (const u of users) { const c = u.city || 'Not set'; byCity[c] = (byCity[c] ?? 0) + 1 }

  return (
    <div className="page">
      <PageHeader
        title="Team and access"
        description="Who can sign in and what each person can open."
        actions={<a href="/users/all" className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add user</a>}
      />

      <StatGrid>
        <Stat label="Users" value={users.length} hint={`${active.length} active`} href="/users/all" />
        <Stat label="Administrators" value={admins.length} hint="Full access" />
        <Stat label="Pending requests" value={requests.length} tone={requests.length ? 'warning' : 'neutral'} hint={requests.length ? 'Awaiting review' : 'None waiting'} href="/admin/access-requests" />
        <Stat label="Without a password" value={noPassword.length} hint={noPassword.length ? 'Set on first sign-in' : 'Everyone has one'} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Module access</h2>
            <a href="/users/permissions" className="card-link">Access overview</a>
          </div>
          <ul className="space-y-3.5 p-5">
            {moduleReach.map(({ m, n }) => (
              <li key={m}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-gray-800">{MODULE_LABELS[m]}</span>
                  <span className="tabular-nums text-gray-500"><span className="font-medium text-gray-900">{n}</span> of {active.length} active users</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${active.length ? (n / active.length) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Access requests</h2>
              <a href="/admin/access-requests" className="card-link">Review</a>
            </div>
            {requests.length === 0 ? <EmptyState icon={Inbox} title="No pending requests" compact /> : (
              <ul className="divide-y divide-gray-100">
                {requests.slice(0, 4).map(r => (
                  <li key={r.id}>
                    <a href="/admin/access-requests" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                      <Avatar name={r.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-gray-900">{r.name}</span>
                        <span className="block truncate text-xs text-gray-500">{r.email}</span>
                      </span>
                      <Badge className="capitalize">{r.requested_role}</Badge>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header"><h2 className="card-title">By city</h2></div>
            <ul className="divide-y divide-gray-100">
              {Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([city, n]) => (
                <li key={city} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="text-gray-800">{city}</span>
                  <span className="tabular-nums text-gray-500">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="card mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600"><DatabaseZap size={16} /></span>
          <div>
            <p className="text-[13px] font-medium text-gray-900">Import from Airtable</p>
            <p className="text-xs text-gray-500 mt-0.5">Bring products, suppliers and clients across from the Airtable workspace.</p>
          </div>
        </div>
        <a href="/admin/import" className="btn-secondary shrink-0">Open import</a>
      </section>
    </div>
  )
}

export default function UsersDashboardPage() {
  return <Gate admin><UsersDashboard /></Gate>
}
