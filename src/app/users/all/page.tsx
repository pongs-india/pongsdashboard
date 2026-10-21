'use client'
import { useEffect, useMemo, useState } from 'react'
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
import { DataTable, type Col } from '@/components/DataTable'
import { useFilters, FilterSelect, optionsFrom } from '@/components/filters'

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
  const [loadError, setLoadError] = useState('')
  const flt = useFilters({ access: '', status: '', module: '', city: '', password: '' })
  const fv = flt.values
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/users')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `The server returned ${r.status}.`); return d })
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoadError(''); setLoading(false) })
      .catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the server.'); setLoading(false) })
  }
  useEffect(() => { load() }, [])

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
    toast(editId ? 'User updated' : 'User added')
    setShowForm(false); setForm(emptyForm()); setEditId(null); load()
  }
  async function handleDelete(u: User) {
    const ok = await confirmDialog({ title: 'Delete user', body: `${u.name} will no longer be able to sign in. Their past activity stays in the log, and an administrator can restore the account from the audit log for 30 days (the password will need to be set again).`, confirmLabel: 'Delete user', tone: 'danger' })
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

  const isAdminUser = (u: User) => (u.role ?? u.access_level) === 'admin'
  const rows = useMemo(() => users.map(u => {
    const admin = isAdminUser(u)
    const perms = parsePermissions(u.permissions_json)
    const mods = MODULES.filter(m => perms[m]?.view)
    return { ...u, admin, access: admin ? 'Admin' : 'Standard', modules: admin ? 'All modules' : mods.map(m => MODULE_LABELS[m]).join(', '), modKeys: admin ? [...MODULES] : mods, added: String(u.created_at ?? '').slice(0, 10) }
  }).filter(u =>
    (!fv.access || (fv.access === 'admin' ? u.admin : !u.admin)) && (!fv.status || u.status === fv.status) &&
    (!fv.module || (u.modKeys as string[]).includes(fv.module)) && (!fv.city || u.city === fv.city) &&
    (!fv.password || (fv.password === 'set' ? u.has_password : !u.has_password))), [users, fv])

  const cols: Col[] = [
    { key: 'name', label: 'User', sub: { key: 'email', label: 'Email' }, render: r => (
      <div className="flex items-center gap-3"><Avatar name={String(r.name)} size={30} /><a href={`/users/${r.id}`} className="truncate">{String(r.name)}</a></div>
    ) },
    { key: 'phone', label: 'Phone', hideBelow: 'md' },
    { key: 'city', label: 'City', hideBelow: 'lg' },
    { key: 'access', label: 'Access', sortValue: r => (r.admin ? 0 : 1),
      render: r => r.admin ? <Badge tone="accent"><ShieldCheck size={12} /> Admin</Badge> : <Badge>Standard</Badge> },
    { key: 'modules', label: 'Modules', hideBelow: 'xl', className: 'max-w-[260px] truncate', render: r => r.modules ? <span className="text-[12px] text-muted">{String(r.modules)}</span> : <span className="text-[12px] text-faint">No modules</span> },
    { key: 'status', label: 'Status', value: r => (r.status === 'active' ? 'Active' : 'Inactive'), render: r => (
      <><Badge tone={r.status === 'active' ? 'success' : 'neutral'} dot>{r.status === 'active' ? 'Active' : 'Inactive'}</Badge>
        {!r.has_password && r.status === 'active' && <div className="mt-0.5 text-[11px] text-faint">No password yet</div>}</>
    ) },
    { key: 'added', label: 'Added', kind: 'date', hideBelow: 'xl' },
  ]

  return (
    <div className="page">
      <PageHeader
        title="All users"
        description="Everyone who can sign in. Access is set per user."
        actions={<button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null); setError('') }} className="btn-primary"><Plus size={15} strokeWidth={2.25} /> Add user</button>}
      />

      <DataTable
        title="Users"
        cols={cols}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={loadError}
        onRetry={load}
        rowHref={r => `/users/${r.id}`}
        initialSort={{ key: 'name', dir: 1 }}
        searchPlaceholder="Search name, email, city"
        rowActions={r => [
          { icon: 'open', label: `Open ${r.name}`, href: `/users/${r.id}` },
          { icon: 'edit', label: `Edit ${r.name}`, onClick: () => openEdit(r as unknown as User) },
          { icon: 'trash', label: `Delete ${r.name}`, tone: 'danger', onClick: () => handleDelete(r as unknown as User) },
        ]}
        filters={<>
          <FilterSelect value={fv.access} onChange={x => flt.set({ access: x })} all="Any access" className="w-full sm:w-36" options={[{ value: 'admin', label: 'Admins' }, { value: 'standard', label: 'Standard' }]} />
          <FilterSelect value={fv.status} onChange={x => flt.set({ status: x })} all="Any status" className="w-full sm:w-36" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <FilterSelect value={fv.module} onChange={x => flt.set({ module: x })} all="Any module" className="w-full sm:w-44" options={MODULES.map(m => ({ value: m, label: `Can use ${MODULE_LABELS[m]}` }))} />
          <FilterSelect value={fv.city} onChange={x => flt.set({ city: x })} all="All cities" className="w-full sm:w-40" options={optionsFrom(users, u => u.city)} />
          <FilterSelect value={fv.password} onChange={x => flt.set({ password: x })} all="Password set or not" className="w-full sm:w-48" options={[{ value: 'set', label: 'Password set' }, { value: 'unset', label: 'No password yet' }]} />
        </>}
        filtersActive={flt.active}
        onClearFilters={flt.clear}
        empty={{ icon: Users, title: 'No users yet', description: 'Add the people who quote, install and manage jobs, with access to just the modules they need.',
          action: <button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null); setError('') }} className="btn-primary btn-sm"><Plus size={14} /> Add user</button> }}
      />

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

