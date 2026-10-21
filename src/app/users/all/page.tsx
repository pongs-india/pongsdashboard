'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, ShieldCheck } from 'lucide-react'
import Gate from '@/components/Gate'
import { useNewParam } from '@/lib/useNewParam'
import { Select } from '@/components/controls'
import { confirmDialog, toast } from '@/components/feedback'
import { PageHeader, EmptyState, LoadingRows, SearchInput, Badge, Avatar, Modal, Field } from '@/components/ui'
import {
  MODULES, MODULE_LABELS, ACTIONS, emptyPermissions,
  parsePermissions, type UserPermissions, type ModuleName, type ActionName,
} from '@/lib/permissions'
import { navigate } from '@/lib/navigate'
import { useSort, SortHeader, usePagination, Pagination, downloadCsv, ExportButton } from '@/components/table'

interface User {
  id: string; name: string; email: string; phone: string; city: string
  access_level: string; role: string; status: string; created_at: string; notes: string
  bases: string; permissions_json?: string; has_password?: boolean
}

const STATUSES = ['active', 'inactive']

interface FormState {
  name: string; email: string; phone: string; city: string
  status: string; notes: string; bases: string
  password: string
  isAdmin: boolean
  permissions: UserPermissions
}

const emptyForm = (): FormState => ({
  name: '', email: '', phone: '', city: '', status: 'active', notes: '', bases: '[]',
  password: '',
  isAdmin: false, permissions: emptyPermissions(),
})

const ACTION_LABEL: Record<ActionName, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' }

function AllUsersInner() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  useNewParam(() => setShowForm(true))
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<string | null>(null)

  function load() {
    let url = '/api/users'
    const params: string[] = []
    if (roleFilter) params.push(`access_level=${encodeURIComponent(roleFilter)}`)
    if (statusFilter) params.push(`status=${encodeURIComponent(statusFilter)}`)
    if (params.length) url += '?' + params.join('&')
    fetch(url).then(r => r.json()).then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [roleFilter, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // /users/all?edit=<id> opens that user's editor (linked from the user page).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit')
    if (id) setPendingEdit(id)
  }, [])
  useEffect(() => {
    if (!pendingEdit || loading) return
    const u = users.find(x => x.id === pendingEdit)
    if (u) openEdit(u)
    setPendingEdit(null)
  }, [pendingEdit, loading, users]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    // The role/permissions the server persists are derived from these fields.
    const payload = {
      name: form.name, email: form.email, phone: form.phone, city: form.city,
      status: form.status, notes: form.notes, bases: form.bases,
      role: form.isAdmin ? 'admin' : 'viewer',
      is_admin: form.isAdmin,
      permissions: form.isAdmin ? undefined : form.permissions,
      // Blank on edit = keep existing password; set = create/reset it.
      password: form.password || undefined,
    }
    const res = editId
      ? await fetch(`/api/users/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save the user.'); return
    }
    setShowForm(false); setForm(emptyForm()); setEditId(null); load()
  }
  async function handleDelete(u: User) {
    const ok = await confirmDialog({ title: 'Delete user', body: `${u.name} will no longer be able to sign in. Their past activity stays in the log.`, confirmLabel: 'Delete user', tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast('Could not delete the user', { tone: 'error', description: d.error }); return }
    toast(`${u.name} deleted`)
    load()
  }
  function openEdit(u: User) {
    const isAdmin = (u.role ?? u.access_level) === 'admin'
    setForm({
      name: u.name, email: u.email ?? '', phone: u.phone ?? '', city: u.city ?? '',
      status: u.status ?? 'active', notes: u.notes ?? '', bases: u.bases ?? '[]',
      password: '',
      isAdmin,
      permissions: parsePermissions(u.permissions_json),
    })
    setEditId(u.id); setShowForm(true); setError('')
  }

  function togglePerm(module: ModuleName, action: ActionName) {
    setForm(f => {
      const mod = { ...f.permissions[module], [action]: !f.permissions[module][action] }
      // Turning off view cascades off the write actions; turning on a write
      // action implies view.
      if (action === 'view' && !mod.view) { mod.create = false; mod.edit = false; mod.delete = false }
      if (action !== 'view' && mod[action]) mod.view = true
      return { ...f, permissions: { ...f.permissions, [module]: mod } }
    })
  }
  function toggleModuleAll(module: ModuleName, on: boolean) {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [module]: { view: on, create: on, edit: on, delete: on } } }))
  }

  const q = search.toLowerCase()
  const filtered = users.filter(u => !q || u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q) || (u.city ?? '').toLowerCase().includes(q))
  const isAdminUser = (u: User) => u.role === 'admin' || u.access_level === 'admin'
  const { sorted, sort, toggle } = useSort(filtered, {
    name: u => u.name,
    city: u => u.city,
    access: u => (isAdminUser(u) ? 0 : 1),
    status: u => u.status,
  }, { key: 'name', dir: 'asc' })
  const pager = usePagination(sorted, 25)
  const exportCsv = () => downloadCsv('pongs-users', ['Name', 'Email', 'Phone', 'City', 'Access', 'Status', 'Added'],
    sorted.map(u => [u.name, u.email, u.phone, u.city, isAdminUser(u) ? 'Admin' : 'Standard', u.status, String(u.created_at ?? '').slice(0, 10)]))

  return (
    <div className="page">
      <PageHeader
        title="All users"
        description="Everyone who can sign in. Access is set per user."
        actions={<>
          <ExportButton onClick={exportCsv} disabled={loading || sorted.length === 0} />
          <button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null); setError('') }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add user</button>
        </>}
      />

      <div className="table-wrap">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented" role="group" aria-label="Access">
              {[['', 'Everyone'], ['admin', 'Admins'], ['viewer', 'Standard']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={roleFilter === v} data-active={roleFilter === v} onClick={() => setRoleFilter(v)}>{l}</button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Status">
              {[['', 'Any status'], ['active', 'Active'], ['inactive', 'Inactive']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={statusFilter === v} data-active={statusFilter === v} onClick={() => setStatusFilter(v)}>{l}</button>
              ))}
            </div>
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, city" />
        </div>
        {loading ? <LoadingRows rows={5} cols={5} /> : filtered.length === 0 ? (
          <EmptyState icon={Users} title={users.length ? 'No users match' : 'No users yet'}
            description={users.length ? 'Try a different name, email or city.' : 'Add the people who quote, install and manage jobs, with access to just the modules they need.'}
            action={users.length ? undefined : <button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null); setError('') }} className="btn-primary"><Plus size={15} /> Add user</button>} />
        ) : (
          <div className="table-scroll">
            <table className="table table-hover">
              <thead>
                <tr>
                  <SortHeader label="User" sortKey="name" sort={sort} onSort={toggle} />
                  <th className="hidden md:table-cell">Phone</th>
                  <SortHeader label="City" sortKey="city" sort={sort} onSort={toggle} className="hidden lg:table-cell" />
                  <SortHeader label="Access" sortKey="access" sort={sort} onSort={toggle} />
                  <th className="hidden xl:table-cell">Modules</th>
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                  <th className="w-20"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map(u => {
                  const admin = (u.role ?? u.access_level) === 'admin'
                  const perms = parsePermissions(u.permissions_json)
                  const mods = MODULES.filter(m => perms[m]?.view)
                  return (
                    <tr key={u.id} className="cursor-pointer" onClick={e => {
                      if ((e.target as HTMLElement).closest('button,a')) return
                      navigate(`/users/${u.id}`, e)
                    }}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size={30} />
                          <div className="min-w-0">
                            <a href={`/users/${u.id}`} className="block truncate font-medium text-gray-900 hover:underline">{u.name}</a>
                            <div className="truncate text-xs text-gray-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">{u.phone || '—'}</td>
                      <td className="hidden lg:table-cell">{u.city || '—'}</td>
                      <td>{admin ? <Badge tone="accent"><ShieldCheck size={12} /> Admin</Badge> : <Badge>Standard</Badge>}</td>
                      <td className="hidden xl:table-cell text-xs text-gray-600 max-w-[240px] truncate">
                        {admin ? 'All modules' : mods.length ? mods.map(m => MODULE_LABELS[m]).join(', ') : <span className="text-gray-400">No modules</span>}
                      </td>
                      <td>
                        <Badge tone={u.status === 'active' ? 'success' : 'neutral'} dot>{u.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                        {!u.has_password && u.status === 'active' && <div className="mt-0.5 text-2xs text-gray-500">No password yet</div>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button onClick={() => openEdit(u)} className="btn-ghost btn-icon" aria-label={`Edit ${u.name}`}><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(u)} className="btn-ghost btn-icon text-gray-400 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${u.name}`}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && sorted.length > 0 && <Pagination {...pager} noun="users" />}
      </div>

      {showForm && (
        <Modal title={editId ? `Edit ${form.name || 'user'}` : 'Add user'} onClose={() => { setShowForm(false); setEditId(null) }} width="max-w-2xl"
          footer={<>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancel</button>
            <button type="submit" form="user-form" className="btn-primary" disabled={saving || !form.name || !form.email}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add user'}</button>
          </>}>
          <form id="user-form" onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="alert-error">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" required className="sm:col-span-2"><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" autoFocus /></Field>
              <Field label="Email" required><input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" /></Field>
              <Field label="Phone"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" /></Field>
              <Field label="City"><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input" /></Field>
              <Field label="Status">
                <Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} ariaLabel="Status"
                  options={STATUSES.map(s => ({ value: s, label: s === 'active' ? 'Active' : 'Inactive' }))} />
              </Field>
              <Field label={editId ? 'Reset password' : 'Password'} className="sm:col-span-2"
                hint={editId ? 'Leave blank to keep the current password.' : 'Optional. If left blank the user sets one at first sign-in.'}>
                <input type="password" value={form.password} autoComplete="new-password"
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input" placeholder="At least 8 characters" />
              </Field>
            </div>

            <div className="space-y-3">
              <h3 className="section-title">Access</h3>
              <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${form.isAdmin ? 'border-brand-600 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="checkbox" checked={form.isAdmin} onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))} className="checkbox mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium text-gray-900">Full administrator</span>
                  <span className="block text-xs text-gray-500 mt-0.5">Every module, user management, access requests and imports. Leave off to grant specific modules below.</span>
                </span>
              </label>

              {!form.isAdmin && (
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                        <th className="text-left font-medium px-3 h-9">Module</th>
                        {ACTIONS.map(a => <th key={a} className="font-medium px-2 h-9 text-center w-16">{ACTION_LABEL[a]}</th>)}
                        <th className="font-medium px-2 h-9 text-center w-16">All</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {MODULES.map(m => {
                        const mod = form.permissions[m]
                        const allOn = mod.view && mod.create && mod.edit && mod.delete
                        return (
                          <tr key={m} className="hover:bg-gray-50/60">
                            <td className="px-3 py-2 font-medium text-gray-800">{MODULE_LABELS[m]}</td>
                            {ACTIONS.map(a => (
                              <td key={a} className="px-2 py-2 text-center">
                                <input type="checkbox" className="checkbox" checked={mod[a]} onChange={() => togglePerm(m, a)} aria-label={`${MODULE_LABELS[m]} ${ACTION_LABEL[a]}`} />
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center">
                              <input type="checkbox" className="checkbox" checked={allOn} onChange={e => toggleModuleAll(m, e.target.checked)} aria-label={`All ${MODULE_LABELS[m]} permissions`} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="border-t border-gray-100 bg-gray-50/60 px-3 py-2 text-xs text-gray-500">View is required before create, edit or delete. Standard users only ever see their own quotes.</p>
                </div>
              )}
            </div>

            <Field label="Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default function AllUsersPage() {
  return <Gate admin><AllUsersInner /></Gate>
}

