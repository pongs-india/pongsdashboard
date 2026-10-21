'use client'

import { useEffect, useState } from 'react'
import { GitBranch, Plus } from 'lucide-react'
import type { Quote } from '@/lib/types'
import { fmtINR, calculateQuote } from '@/lib/calculations'
import { EmptyState, LoadingRows, StatusBadge } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import { toast } from '@/components/feedback'
import { navigate } from '@/lib/navigate'

export default function RevisionTrail({ quoteId }: { quoteId: string }) {
  const [revs, setRevs] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/quotes/${quoteId}/revisions`)
      .then(async r => {
        if (!r.ok) { setError(r.status === 403 ? 'You don’t have access to this quote.' : 'Revision history could not be found.'); return [] }
        return r.json()
      })
      .then(d => { setRevs(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [quoteId])

  async function createRevision() {
    setCreating(true)
    const res = await fetch(`/api/quotes/${quoteId}/revisions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    setCreating(false)
    if (!res.ok) { toast('Could not create a revision', { tone: 'error' }); return }
    const created = await res.json()
    navigate(`/quotes/${created.id}/edit`)
  }

  function total(q: Quote): number {
    try { return calculateQuote(q).grandTotal } catch { return Number(q.grandTotal ?? 0) }
  }

  const base = revs[0] ? total(revs[0]) : 0

  return (
    <section className="table-wrap">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 h-14 border-b border-gray-200">
        <div>
          <h2 className="card-title">Revision history</h2>
          <p className="text-xs text-gray-500">{loading ? 'Loading…' : `${revs.length} version${revs.length !== 1 ? 's' : ''}. Revisions never overwrite the original.`}</p>
        </div>
        {!loading && !error && (
          <button onClick={createRevision} disabled={creating} className="btn-secondary btn-sm">
            <Plus size={14} /> {creating ? 'Creating…' : 'New revision'}
          </button>
        )}
      </div>

      {error && <div className="p-5"><div className="alert-error">{error}</div></div>}
      {loading ? <LoadingRows rows={3} cols={4} /> : !error && revs.length === 0 ? (
        <EmptyState icon={GitBranch} title="No revisions yet" compact />
      ) : (
        <ol className="relative">
          {revs.map((q, i) => {
            const rev = Number(q.revision ?? 0)
            const t = total(q)
            const delta = i > 0 ? t - base : 0
            const current = q.id === quoteId
            return (
              <li key={q.id} className={`relative flex gap-4 px-5 py-4 ${i > 0 ? 'border-t border-gray-100' : ''} ${current ? 'bg-brand-50/40' : ''}`}>
                <div className="relative flex flex-col items-center">
                  <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border text-2xs font-semibold ${
                    rev === 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                    {rev === 0 ? 'O' : `R${rev}`}
                  </span>
                  {i < revs.length - 1 && <span className="absolute top-7 -bottom-4 w-px bg-gray-200" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-900">{rev === 0 ? 'Original quote' : `Revision ${rev}`}</span>
                    <span className="mono text-xs text-gray-500">{q.quoteNumber}</span>
                    <StatusBadge status={q.status ?? 'draft'} />
                    {current && <span className="badge-success">Viewing</span>}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {[
                      fmtDate(q.updatedAt ?? q.createdAt),
                      q.revisedBy ? `by ${q.revisedBy}` : rev === 0 && q.ownerEmail ? `by ${q.ownerEmail}` : null,
                      `${q.items?.length ?? 0} item${(q.items?.length ?? 0) === 1 ? '' : 's'}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-2 flex items-center gap-1 -ml-2">
                    <a href={`/quotes/${q.id}/team`} className="btn-ghost btn-xs">Open</a>
                    <a href={`/quotes/${q.id}/edit`} className="btn-ghost btn-xs">Edit</a>
                    <a href={`/quotes/${q.id}/client`} className="btn-ghost btn-xs">Client PDF</a>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-semibold text-gray-900 tabular-nums">{fmtINR(t)}</p>
                  {i > 0 && delta !== 0 && (
                    <p className={`text-xs tabular-nums ${delta > 0 ? 'text-gray-600' : 'text-red-700'}`}>
                      {delta > 0 ? '+' : '−'}{fmtINR(Math.abs(delta))} vs original
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
