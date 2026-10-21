import { SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm">
        <SearchX size={18} strokeWidth={1.75} />
      </div>
      <p className="font-mono text-xs font-medium text-gray-500">404</p>
      <h1 className="mt-1 text-lg font-semibold text-gray-900">We couldn’t find that page</h1>
      <p className="mt-1.5 text-[13px] text-gray-500">The link may be out of date, or the record was removed. Use search (⌘K) to find what you need.</p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <a href="/" className="btn-primary">Go to dashboard</a>
        <a href="/quotes" className="btn-secondary">Open quotes</a>
      </div>
    </div>
  )
}
