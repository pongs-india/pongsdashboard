'use client'
import { useState } from 'react'
import { ArrowUpRight, HardHat } from 'lucide-react'
import { confirmDialog, toast } from '@/components/feedback'
import { navigate } from '@/lib/navigate'

// Converts a quote into a project. When a project already exists for the quote
// we link to it instead of offering a second conversion.
export default function ConvertToProjectButton({ quoteId, projectId, primary = false }: { quoteId: string; projectId: string | null; primary?: boolean }) {
  const cls = primary ? 'btn-primary' : 'btn-secondary'
  const [converting, setConverting] = useState(false)

  if (projectId) {
    return (
      <a href={`/projects/${projectId}`} className={cls}>
        <HardHat size={14} /> Open project <ArrowUpRight size={13} className="opacity-60" />
      </a>
    )
  }

  const convert = async () => {
    const ok = await confirmDialog({ title: 'Convert to project', body: 'A project is created with this quote\'s client, site and contract value, and the quote is marked as approved. You can then schedule the installation and track payments.', confirmLabel: 'Create project' })
    if (!ok) return
    setConverting(true)
    const r = await fetch(`/api/quotes/${quoteId}/to-project`, { method: 'POST' })
    const data = await r.json().catch(() => ({}))
    setConverting(false)
    if (data.project_id) {
      navigate(`/projects/${data.project_id}`)
    } else {
      toast('Could not create the project', { tone: 'error', description: data.error })
    }
  }

  return (
    <button onClick={convert} disabled={converting} className={cls}>
      <HardHat size={14} /> {converting ? 'Creating project…' : 'Convert to project'}
    </button>
  )
}
