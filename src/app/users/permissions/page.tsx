'use client'
import Gate from '@/components/Gate'
import { useEffect, useState } from 'react'
import { Info, ShieldCheck } from 'lucide-react'
import { PageHeader, Avatar, Badge, LoadingRows, EmptyState, SearchInput } from '@/components/ui'
import { MODULES, MODULE_LABELS, parsePermissions } from '@/lib/permissions'
import { accessLevel, type AccessLevel } from '@/lib/access'
import { navigate } from '@/lib/navigate'

interface User { id: string; name: string; email: string; role: string; access_level: string; status: string; permissions_json?: string }

const CELL: Record<AccessLevel, { label: string; cls: string }> = {
  full: { label: 'Full', cls: 'bg-brand-50 text-brand-800 ring-brand-200/70' },
  edit: { label: 'Edit', cls: 'bg-white text-gray-900 ring-gray-300' },
  view: { label: 'View', cls: 'bg-gray-50 text-gray-500 ring-gray-200' },
  none: { label: 'None', cls: 'text-gray-300 ring-transparent' },
}

// Access is granted per user (see src/lib/permissions.ts). This page shows the
// effective access of every user in one grid; editing happens on the user.
function AccessOverview() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const q = search.toLowerCase()
  const rows = users
    .filter(u => showInactive || u.status === 'active')
    .filter(u => !q || u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))

  return (
    <div className="page">
      <PageHeader title="Access overview" description="What every user can open, module by module." />

      <div className="alert-info mb-4">
        <Info size={15} className="mt-0.5 shrink-0 text-gray-500" />
        <span>Access is set per user, not per role. To change someone&apos;s access, open their row and edit their permissions. Full means view, create, edit and delete.</span>
      </div>

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 pl-1 text-xs text-gray-600">
            <input type="checkbox" className="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Include inactive users
          </label>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users" />
        </div>
        {loading ? <LoadingRows rows={5} cols={6} /> : rows.length === 0 ? <EmptyState icon={ShieldCheck} title="No users to show" compact /> : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th className="min-w-[220px]">User</th>
                  {MODULES.map(m => <th key={m} className="text-center">{MODULE_LABELS[m]}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(u => {
                  const admin = (u.role ?? u.access_level) === 'admin'
                  const perms = parsePermissions(u.permissions_json)
                  return (
                    <tr key={u.id} className="cursor-pointer" onClick={e => navigate(`/users/${u.id}`, e)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size={28} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-gray-900">{u.name}</span>
                              {admin && <Badge tone="accent">Admin</Badge>}
                              {u.status !== 'active' && <Badge>Inactive</Badge>}
                            </div>
                            <div className="truncate text-xs text-gray-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      {MODULES.map(m => {
                        const lvl: AccessLevel = admin ? 'full' : accessLevel(perms[m])
                        return (
                          <td key={m} className="text-center">
                            <span className={`inline-flex h-6 min-w-[44px] items-center justify-center rounded px-1.5 text-xs font-medium ring-1 ring-inset ${CELL[lvl].cls}`}>{CELL[lvl].label}</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PermissionsPage() {
  return <Gate admin><AccessOverview /></Gate>
}
