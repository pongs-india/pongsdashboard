'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, CircleCheckBig, X } from 'lucide-react'
import type { AttentionItem } from '@/lib/attention'

const URGENCY_DOT = ['bg-red-500', 'bg-amber-500', 'bg-gray-300'] as const
const URGENCY_LABEL = ['Overdue', 'Due now', 'When you can'] as const

// Today's to-do list, built from the records themselves.
export function AttentionCard({ items, loading }: { items: AttentionItem[]; loading: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, 5)

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Needs your attention</h2>
        {!loading && items.length > 0 && <span className="text-xs tabular-nums text-gray-500">{items.length} to do</span>}
      </div>
      {loading ? (
        <div className="space-y-3 p-5">{[0, 1, 2].map(i => <div key={i} className="skeleton h-4" style={{ width: `${70 - i * 12}%` }} />)}</div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><CircleCheckBig size={16} /></span>
          <div>
            <p className="text-[13px] font-medium text-gray-900">You are all caught up</p>
            <p className="text-xs text-gray-500">Follow-ups, approvals, installations and payments that need action will appear here.</p>
          </div>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {shown.map(it => (
              <li key={it.id}>
                <a href={it.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT[it.urgency]}`} title={URGENCY_LABEL[it.urgency]} aria-label={URGENCY_LABEL[it.urgency]} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">{it.title}</span>
                    <span className="block truncate text-xs text-gray-500">{it.detail}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-gray-600 group-hover:text-gray-900 sm:inline-flex">
                    {it.cta} <ArrowRight size={13} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {items.length > 5 && (
            <div className="table-footer">
              <button type="button" onClick={() => setExpanded(v => !v)} className="font-medium text-gray-700 hover:text-gray-900">
                {expanded ? 'Show fewer' : `Show ${items.length - 5} more`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export type SetupStep = { id: string; title: string; description: string; done: boolean; href: string; cta: string }

const HIDE_KEY = 'pongs.setup.hidden'

// First-run checklist. It disappears by itself once every step is done, and
// can be hidden earlier.
export function GettingStarted({ steps, extra }: { steps: SetupStep[]; extra?: React.ReactNode }) {
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === '1') } catch { setHidden(false) }
  }, [])

  const done = steps.filter(s => s.done).length
  if (hidden || steps.length === 0 || done === steps.length) return null
  const next = steps.find(s => !s.done)

  return (
    <section className="card mb-6 overflow-hidden" aria-label="Get set up">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Get set up</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">A few steps to run your first job end to end, from quote to installation.</p>
        </div>
        <button type="button" className="btn-ghost btn-icon -mr-2 -mt-1" aria-label="Hide setup guide"
          onClick={() => { setHidden(true); try { localStorage.setItem(HIDE_KEY, '1') } catch { /* private mode */ } }}>
          <X size={15} />
        </button>
      </div>
      <div className="flex items-center gap-3 px-5 pt-3">
        <div className="h-1.5 flex-1 rounded-full bg-gray-100">
          <div className="h-1.5 rounded-full bg-brand-600 transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-gray-500">{done} of {steps.length} done</span>
      </div>
      <ol className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
        {steps.map((s, i) => {
          const isNext = s.id === next?.id
          return (
            <li key={s.id} className={`flex items-center gap-3 px-5 py-3 ${isNext ? 'bg-brand-50/40' : ''}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done ? 'bg-brand-600 text-white' : isNext ? 'bg-white text-brand-700 ring-[1.5px] ring-brand-600' : 'bg-white text-gray-500 ring-1 ring-gray-300'
              }`}>
                {s.done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] font-medium ${s.done ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-900'}`}>{s.title}</span>
                {!s.done && <span className="block text-xs text-gray-500">{s.description}</span>}
              </span>
              {!s.done && (
                <a href={s.href} className={isNext ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>{s.cta}</a>
              )}
            </li>
          )
        })}
      </ol>
      {extra && <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">{extra}</div>}
    </section>
  )
}
