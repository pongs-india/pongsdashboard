'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, FileDown, GitBranch, Send, X } from 'lucide-react'
import { NextStep, type StepState } from '@/components/ui'
import ConvertToProjectButton from '@/components/ConvertToProjectButton'
import { confirmDialog, toast } from '@/components/feedback'
import { navigate } from '@/lib/navigate'

// Walks a quote through its lifecycle: draft, sent, decided, project. The
// panel always names the single next action and performs it in one click.
export default function QuoteNextStep({
  quoteId,
  status,
  projectId,
  clientName,
  onClientTab = false,
}: {
  quoteId: string
  status: string
  projectId: string | null
  clientName: string
  onClientTab?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function setStatus(next: 'sent' | 'approved' | 'rejected', message: string) {
    setBusy(next)
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    })
    setBusy(null)
    if (!res.ok) { toast('Could not update the quote', { tone: 'error', description: res.status === 403 ? 'You do not have permission to edit quotes.' : undefined }); return }
    toast(message)
    router.refresh()
  }

  async function revise() {
    setBusy('revise')
    const res = await fetch(`/api/quotes/${quoteId}/revisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const created = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok || !created?.id) { toast('Could not create a revision', { tone: 'error' }); return }
    navigate(`/quotes/${created.id}/edit`)
  }

  const s = ['sent', 'approved', 'rejected'].includes(status) ? status : 'draft'
  const decided = s === 'approved' || s === 'rejected'
  const steps: { label: string; state: StepState }[] = [
    { label: 'Draft', state: s === 'draft' ? 'current' : 'done' },
    { label: 'Sent to client', state: s === 'sent' ? 'current' : s === 'draft' ? 'upcoming' : 'done' },
    { label: s === 'rejected' ? 'Rejected' : 'Approved', state: s === 'rejected' ? 'problem' : s === 'approved' ? (projectId ? 'done' : 'current') : 'upcoming' },
    { label: 'Project', state: projectId ? 'done' : 'upcoming' },
  ]

  if (s === 'draft') {
    return (
      <NextStep steps={steps}
        title="Share the quote with the client"
        description={onClientTab
          ? 'Download or print this PDF and send it to the client, then mark the quote as sent.'
          : 'Check the figures, send the client PDF, then mark the quote as sent so it is tracked for follow-up.'}
        actions={<>
          {!onClientTab && <a href={`/quotes/${quoteId}/client`} className="btn-secondary"><FileDown size={14} /> Client PDF</a>}
          <button className="btn-primary" disabled={!!busy} onClick={() => setStatus('sent', 'Quote marked as sent')}>
            <Send size={14} /> {busy === 'sent' ? 'Saving…' : 'Mark as sent'}
          </button>
        </>} />
    )
  }

  if (s === 'sent') {
    return (
      <NextStep steps={steps}
        title={`Waiting for ${clientName || 'the client'} to decide`}
        description="Record the outcome when you hear back. An approved quote can be turned into an installation project."
        actions={<>
          <button className="btn-secondary" disabled={!!busy} onClick={async () => {
            const ok = await confirmDialog({ title: 'Mark as rejected', body: 'The quote is kept for your records. You can still create a revised quote later.', confirmLabel: 'Mark as rejected' })
            if (ok) setStatus('rejected', 'Quote marked as rejected')
          }}><X size={14} /> Rejected</button>
          <button className="btn-primary" disabled={!!busy} onClick={() => setStatus('approved', 'Quote approved')}>
            <Check size={14} /> {busy === 'approved' ? 'Saving…' : 'Approved'}
          </button>
        </>} />
    )
  }

  if (s === 'approved' && !projectId) {
    return (
      <NextStep steps={steps}
        title="Turn this quote into a project"
        description="Creates the installation project with the client, site and contract value filled in, so you can schedule the team and track payments."
        actions={<ConvertToProjectButton quoteId={quoteId} projectId={null} primary />} />
    )
  }

  if (s === 'approved' && projectId) {
    return (
      <NextStep steps={steps} tone="done"
        title="This quote is now a project"
        description="Scheduling, the site checklist and payments are tracked on the project."
        actions={<ConvertToProjectButton quoteId={quoteId} projectId={projectId} primary />} />
    )
  }

  return (
    <NextStep steps={steps} tone="attention"
      title="The client rejected this quote"
      description={decided ? 'If they are still interested, create a revision with new pricing or scope. The original stays on record.' : undefined}
      actions={<button className="btn-primary" disabled={!!busy} onClick={revise}><GitBranch size={14} /> {busy === 'revise' ? 'Creating…' : 'Create revision'}</button>} />
  )
}
