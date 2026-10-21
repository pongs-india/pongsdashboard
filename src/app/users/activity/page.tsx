export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Activity } from 'lucide-react'
import { dbListActivity } from '@/lib/db'
import { fmtDate } from '@/lib/format'
import { getSessionUser } from '@/lib/session'
import { PageHeader, Avatar, EmptyState } from '@/components/ui'

type Row = Record<string, unknown>

function toDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
}

function relative(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - toDate(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return fmtDate(toDate(iso))
}

// Action codes are stored as "area.verb"; show them as plain sentences.
const ACTION_TEXT: Record<string, string> = {
  'auth.password_set': 'set their password',
  'auth.login': 'signed in',
  'user.create': 'created a user',
  'user.update': 'updated a user',
  'user.delete': 'deleted a user',
}
function describe(action: string): string {
  if (ACTION_TEXT[action]) return ACTION_TEXT[action]
  return action.replace(/[._]/g, ' ')
}

export default async function ActivityPage() {
  const me = await getSessionUser()
  if (!me?.isAdmin) redirect('/quotes')
  const rows = (await dbListActivity(150)) as unknown as Row[]

  const groups: { day: string; items: Row[] }[] = []
  for (const r of rows) {
    const day = fmtDate(toDate(String(r.created_at ?? '')))
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(r)
    else groups.push({ day, items: [r] })
  }

  return (
    <div className="page">
      <PageHeader title="Activity log" description="Sign-ins and account changes, newest first. Showing the latest 150 events." />

      <div className="card max-w-4xl">
        {rows.length === 0 ? (
          <EmptyState icon={Activity} title="No activity recorded yet" description="Account events appear here as they happen." />
        ) : groups.map(g => (
          <div key={g.day}>
            <p className="border-b border-gray-100 bg-gray-50/80 px-5 py-2 text-xs font-medium text-gray-500 first:rounded-t-lg">{g.day}</p>
            <ul className="divide-y divide-gray-100">
              {g.items.map((r, i) => (
                <li key={String(r.id ?? i)} className="flex items-start gap-3 px-5 py-3">
                  <Avatar name={String(r.user_name ?? 'System')} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-gray-800">
                      <span className="font-medium text-gray-900">{String(r.user_name ?? 'System')}</span>{' '}
                      {describe(String(r.action ?? ''))}
                    </p>
                    {r.details ? <p className="mt-0.5 text-xs text-gray-500">{String(r.details)}</p> : null}
                  </div>
                  <time className="shrink-0 text-xs text-gray-400 tabular-nums" dateTime={String(r.created_at ?? '')}>{relative(String(r.created_at ?? ''))}</time>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
