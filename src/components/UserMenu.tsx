'use client'
import { useEffect, useState, useRef } from 'react'
import { useMe, resetMe } from '@/lib/useMe'
import { ChevronsUpDown, KeyRound, LogOut, Inbox, ShieldCheck } from 'lucide-react'
import { Avatar, Badge, Field, Modal } from '@/components/ui'

export default function UserMenu() {
  const { me: user, loading } = useMe()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    resetMe()
    window.location.assign('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 px-2 py-1.5" aria-hidden>
        <span className="skeleton h-7 w-7 !rounded-full" />
        <span className="flex-1 space-y-1.5"><span className="skeleton block h-2.5 w-24" /><span className="skeleton block h-2 w-32" /></span>
      </div>
    )
  }
  if (!user) {
    return <a href="/login" className="btn-secondary w-full">Sign in</a>
  }

  const isAdmin = user.isAdmin || user.role === 'admin'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-gray-100 transition-colors">
        <Avatar name={user.name} size={28} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-gray-900">{user.name}</span>
          <span className="block truncate text-2xs text-gray-500">{user.email}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-1.5 rounded-lg border border-gray-200 bg-white shadow-lg z-50 overflow-hidden animate-scale-in origin-bottom">
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">Signed in as</span>
            <Badge tone={isAdmin ? 'accent' : 'neutral'} className="capitalize">{user.role}</Badge>
          </div>
          <div className="p-1">
            {isAdmin && (
              <>
                <MenuLink href="/admin/access-requests" icon={Inbox} label="Access requests" />
                <MenuLink href="/users" icon={ShieldCheck} label="Team & access" />
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
            <button role="menuitem" onClick={() => { setPwOpen(true); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 h-8 text-[13px] text-gray-700 hover:bg-gray-100">
              <KeyRound size={14} className="text-gray-400" /> Change password
            </button>
            <button role="menuitem" onClick={logout}
              className="flex w-full items-center gap-2 rounded-md px-2.5 h-8 text-[13px] text-red-700 hover:bg-red-50">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  )
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof Inbox; label: string }) {
  return (
    <a role="menuitem" href={href} className="flex items-center gap-2 rounded-md px-2.5 h-8 text-[13px] text-gray-700 hover:bg-gray-100">
      <Icon size={14} className="text-gray-400" /> {label}
    </a>
  )
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    const res = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Could not change password'); return }
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <Modal title="Change password" onClose={onClose} width="max-w-sm"
      footer={done ? undefined : (
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" form="pw-form" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Update password'}</button>
        </>
      )}>
      {done ? (
        <p className="alert-success">Your password has been updated.</p>
      ) : (
        <form id="pw-form" onSubmit={submit} className="space-y-4">
          {error && <div className="alert-error">{error}</div>}
          <Field label="Current password">
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" className="input" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required className="input" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required className="input" />
          </Field>
        </form>
      )}
    </Modal>
  )
}
