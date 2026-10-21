import { notFound, redirect } from 'next/navigation'
import DocumentTitle from '@/components/DocumentTitle'
import { Pencil, ShieldCheck, Check, Minus } from 'lucide-react'
import { dbGetUser } from '@/lib/db'
import { fmtDate } from '@/lib/format'
import { getSessionUser, SEED_ADMIN_EMAIL } from '@/lib/session'
import { MODULES, MODULE_LABELS, ACTIONS, parsePermissions } from '@/lib/permissions'
import { accessLevel, ACCESS_LABEL, ACCESS_TONE } from '@/lib/access'
import { Avatar, Badge } from '@/components/ui'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const me = await getSessionUser()
  if (!me?.isAdmin) redirect('/quotes')
  const user = (await dbGetUser(params.id)) as Row | null
  if (!user) notFound()

  // The same rule the server uses to authorise requests (see getSessionUser).
  const role = String(user.role ?? user.access_level ?? 'viewer')
  const isAdmin = role === 'admin' || String(user.email ?? '').toLowerCase() === SEED_ADMIN_EMAIL
  const perms = parsePermissions(user.permissions_json as string | undefined)
  const active = String(user.status ?? 'active') === 'active'

  return (
    <div className="page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={String(user.name)} size={48} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DocumentTitle title={String(String(user.name))} />
              <h1 className="text-xl sm:text-[22px] font-semibold tracking-tight text-gray-900">{String(user.name)}</h1>
              {isAdmin ? <Badge tone="accent"><ShieldCheck size={12} /> Administrator</Badge> : <Badge>Standard user</Badge>}
              <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">{[String(user.email ?? ''), user.city ? String(user.city) : null, `Added ${fmtDate(String(user.created_at ?? ''))}`].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <a href={`/users/all?edit=${user.id}`} className="btn-primary shrink-0"><Pencil size={14} /> Edit user</a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="table-wrap">
          <div className="card-header">
            <h2 className="card-title">Permissions</h2>
            <span className="text-xs text-gray-500">{isAdmin ? 'Administrators can do everything' : 'Set individually for this user'}</span>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Module</th><th>Access</th>{ACTIONS.map(a => <th key={a} className="text-center hidden sm:table-cell">{a.charAt(0).toUpperCase() + a.slice(1)}</th>)}</tr></thead>
              <tbody>
                {MODULES.map(m => {
                  const p = isAdmin ? { view: true, create: true, edit: true, delete: true } : perms[m]
                  const lvl = accessLevel(p)
                  return (
                    <tr key={m}>
                      <td className="font-medium text-gray-900">{MODULE_LABELS[m]}</td>
                      <td><Badge tone={ACCESS_TONE[lvl]}>{ACCESS_LABEL[lvl]}</Badge></td>
                      {ACTIONS.map(a => (
                        <td key={a} className="text-center hidden sm:table-cell">
                          {p?.[a]
                            ? <Check size={15} strokeWidth={2.25} className="inline text-success-600" aria-label="Allowed" />
                            : <Minus size={15} className="inline text-gray-300" aria-label="Not allowed" />}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isAdmin && <div className="table-footer"><span>Standard users only see quotes they created.</span></div>}
        </section>

        <aside className="card self-start">
          <div className="card-header"><h2 className="card-title">Profile</h2></div>
          <dl className="space-y-4 p-5 text-[13px]">
            <div><dt className="text-xs text-gray-500">Email</dt><dd className="mt-0.5 text-gray-900 break-all">{String(user.email ?? '—')}</dd></div>
            <div><dt className="text-xs text-gray-500">Phone</dt><dd className="mt-0.5 text-gray-900">{String(user.phone || '—')}</dd></div>
            <div><dt className="text-xs text-gray-500">City</dt><dd className="mt-0.5 text-gray-900">{String(user.city || '—')}</dd></div>
            <div><dt className="text-xs text-gray-500">Password</dt><dd className="mt-0.5 text-gray-900">{user.password_hash ? 'Set' : 'Not set yet. Created at first sign-in.'}</dd></div>
            {user.notes ? <div><dt className="text-xs text-gray-500">Notes</dt><dd className="mt-0.5 text-gray-900 whitespace-pre-line">{String(user.notes)}</dd></div> : null}
          </dl>
        </aside>
      </div>
    </div>
  )
}
