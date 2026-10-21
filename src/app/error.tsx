'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Shown when a page throws while rendering. Keeps the app shell, explains
// what happened in plain words and offers a retry instead of a blank screen.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="mx-auto max-w-md py-20 text-center animate-fade-in" role="alert">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">This page couldn’t load</h1>
      <p className="mt-1.5 text-[13px] text-gray-500">
        Something went wrong on our side. Your data is safe. Try again, and if it keeps happening share the reference below with your administrator.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-gray-500">Reference: {error.digest}</p>}
      <div className="mt-6 flex items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary"><RotateCcw size={14} /> Try again</button>
        <a href="/" className="btn-secondary">Go to dashboard</a>
      </div>
    </div>
  )
}
