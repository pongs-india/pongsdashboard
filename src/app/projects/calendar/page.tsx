'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { PageHeader, EmptyState, StatusBadge, statusDot } from '@/components/ui'
import { PROJECT_STATUS_LABELS } from '@/components/ProjectFormModal'
import { fmtMonth, fmtDateLong } from '@/lib/format'

type Project = { id: string; name: string; client_name: string; status: string; scheduled_date: string; priority: string; team_lead?: string; city?: string }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const now = new Date()
  const [projects, setProjects] = useState<Project[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string>(now.toISOString().slice(0, 10))

  useEffect(() => { fetch('/api/projects').then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])) }, [])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthProjects = projects.filter(p => p.scheduled_date?.startsWith(monthStr))
  const byDate: Record<string, Project[]> = {}
  for (const p of projects) {
    if (!p.scheduled_date) continue
    const key = p.scheduled_date.slice(0, 10)
    ;(byDate[key] ??= []).push(p)
  }

  const today = now.toISOString().slice(0, 10)
  const selectedProjects = byDate[selected] ?? []
  const trailing = (7 - ((firstDay + daysInMonth) % 7)) % 7

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today) }

  return (
    <div className="page">
      <PageHeader title="Schedule" description={`${monthProjects.length} installation${monthProjects.length !== 1 ? 's' : ''} scheduled in ${fmtMonth(new Date(year, month)).split(' ')[0]}.`} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-gray-200">
            <h2 className="text-[15px] font-semibold text-gray-900">
              {fmtMonth(new Date(year, month))}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={goToday} className="btn-secondary btn-sm">Today</button>
              <button onClick={prev} className="btn-ghost btn-icon" aria-label="Previous month"><ChevronLeft size={16} /></button>
              <button onClick={next} className="btn-ghost btn-icon" aria-label="Next month"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DAY_NAMES.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 [&>*]:border-gray-100 [&>*:not(:nth-child(7n))]:border-r [&>*]:border-b">
            {[...Array(firstDay)].map((_, i) => <div key={`lead${i}`} className="min-h-[96px] bg-gray-50/60" />)}
            {[...Array(daysInMonth)].map((_, i) => {
              const dateStr = `${monthStr}-${String(i + 1).padStart(2, '0')}`
              const dayProjects = byDate[dateStr] ?? []
              const isToday = dateStr === today
              const isSelected = selected === dateStr
              return (
                <button key={dateStr} type="button" onClick={() => setSelected(dateStr)}
                  className={`flex min-h-[96px] flex-col items-stretch justify-start p-1.5 text-left transition-colors ${isSelected ? 'bg-brand-50/50 ring-1 ring-inset ring-brand-600' : 'hover:bg-gray-50'}`}>
                  <span className={`inline-flex self-start h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                    isToday ? 'bg-brand-700 font-semibold text-white' : 'font-medium text-gray-700'}`}>{i + 1}</span>
                  <span className="mt-1 block space-y-0.5">
                    {dayProjects.slice(0, 2).map(p => (
                      <span key={p.id} className="flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-gray-700 bg-white border border-gray-200 truncate">
                        <span className={`dot ${statusDot(p.status)}`} />
                        <span className="truncate">{p.name}</span>
                      </span>
                    ))}
                    {dayProjects.length > 2 && <span className="block px-1 text-2xs font-medium text-gray-500">{dayProjects.length - 2} more</span>}
                  </span>
                </button>
              )
            })}
            {[...Array(trailing)].map((_, i) => <div key={`trail${i}`} className="min-h-[96px] bg-gray-50/60" />)}
          </div>
        </section>

        <aside className="card self-start">
          <div className="px-4 h-14 flex flex-col justify-center border-b border-gray-200">
            <p className="text-[13px] font-semibold text-gray-900">
              {fmtDateLong(selected, { weekday: true, year: false })}
            </p>
            <p className="text-xs text-gray-500">{selectedProjects.length} job{selectedProjects.length !== 1 ? 's' : ''}</p>
          </div>
          {selectedProjects.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Select another day on the calendar." compact />
          ) : (
            <ul className="divide-y divide-gray-100">
              {selectedProjects.map(p => (
                <li key={p.id}>
                  <a href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-gray-900">{p.name}</p>
                      <StatusBadge status={p.status} label={PROJECT_STATUS_LABELS[p.status]} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[p.client_name, p.city, p.team_lead ? `Lead: ${p.team_lead}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
