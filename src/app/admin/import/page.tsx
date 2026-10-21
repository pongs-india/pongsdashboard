'use client'
import Gate from '@/components/Gate'
import { useEffect, useState } from 'react'
import { CheckCircle2, DatabaseZap, Loader2, PlugZap, FlaskConical, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { confirmDialog, toast } from '@/components/feedback'

const SOURCES = [
  { label: 'Inventory products', detail: 'Names, categories, stock levels and prices' },
  { label: 'Suppliers', detail: 'Company and contact details' },
  { label: 'Customers', detail: 'Imported into Clients' },
]

const SAMPLE_LABELS: Record<string, string> = {
  pongs_quotes: 'quotes', clients: 'clients', projects: 'projects', inv_products: 'products',
  inv_suppliers: 'suppliers', inv_purchases: 'purchase orders', inv_movements: 'stock movements', inv_work_completions: 'job records',
}

// Load or remove demonstration records. Sample rows are tagged by id, so
// removing them never affects real data.
function SampleDataCard() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState<'load' | 'remove' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/sample-data').then(r => r.json()).then(d => setCounts(d.counts ?? null)).catch(() => {})
  }, [])

  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0

  async function run(method: 'POST' | 'DELETE') {
    if (method === 'DELETE' && !(await confirmDialog({ title: 'Remove sample data', body: 'All sample clients, quotes, projects and inventory records will be deleted. Real records are not affected.', confirmLabel: 'Remove sample data', tone: 'danger' }))) return
    setBusy(method === 'POST' ? 'load' : 'remove'); setError('')
    const r = await fetch('/api/admin/sample-data', { method })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(d.error ?? `The server returned ${r.status}.`); return }
    setCounts(d.counts ?? null)
    toast(method === 'POST' ? 'Sample data loaded' : 'Sample data removed')
  }

  return (
    <section className="card mt-4 max-w-5xl">
      <div className="card-header">
        <h2 className="card-title">Sample data</h2>
        {total > 0 && <span className="badge-warning">Sample data loaded</span>}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-[13px] text-gray-600">
          Fill the workspace with realistic demonstration records (clients, quotes, projects, inventory and purchases) to review the app.
          Sample records are tagged, so removing them never touches real data. Quote numbers use SAMPLE-A, SAMPLE-B and so on, so real numbering is unaffected.
        </p>
        {total > 0 && counts && (
          <p className="text-xs text-gray-500 tabular-nums">
            Currently loaded: {Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${SAMPLE_LABELS[k] ?? k}`).join(', ')}.
          </p>
        )}
        {error && <div className="alert-error">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => run('POST')} disabled={!!busy} className="btn-primary">
            {busy === 'load' ? <><Loader2 size={14} className="animate-spin" /> Loading…</> : <><FlaskConical size={14} /> {total > 0 ? 'Reload sample data' : 'Load sample data'}</>}
          </button>
          {total > 0 && (
            <button onClick={() => run('DELETE')} disabled={!!busy} className="btn-secondary">
              {busy === 'remove' ? <><Loader2 size={14} className="animate-spin" /> Removing…</> : <><Trash2 size={14} /> Remove sample data</>}
            </button>
          )}
          {total > 0 && <a href="/" className="btn-ghost">Open dashboard</a>}
        </div>
      </div>
    </section>
  )
}

function ImportPage() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; imported?: Record<string, number>; totals?: Record<string, number>; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const r = await fetch('/api/admin/import-airtable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'pongs-import-2024', test: true })
    })
    const data = await r.json()
    setTestResult(data)
    setTesting(false)
  }

  const runImport = async () => {
    setImporting(true)
    setResult(null)
    const r = await fetch('/api/admin/import-airtable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'pongs-import-2024' })
    })
    const data = await r.json()
    setResult(data)
    setImporting(false)
  }

  return (
    <div className="page">
      <PageHeader title="Data import" description="Copy records from the Airtable workspace, or load sample data to review the app." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] max-w-5xl">
        <section className="card">
          <div className="card-header"><h2 className="card-title">What gets imported</h2></div>
          <ul className="divide-y divide-gray-100">
            {SOURCES.map(s => (
              <li key={s.label} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500"><DatabaseZap size={15} /></span>
                <span>
                  <span className="block text-[13px] font-medium text-gray-900">{s.label}</span>
                  <span className="block text-xs text-gray-500">{s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">Records that already exist are skipped, so the import is safe to run again.</p>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-4">
            <button onClick={testConnection} disabled={testing || importing} className="btn-secondary">
              {testing ? <><Loader2 size={14} className="animate-spin" /> Testing…</> : <><PlugZap size={14} /> Test connection</>}
            </button>
            <button onClick={runImport} disabled={importing || testing} className="btn-primary">
              {importing ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : 'Run import'}
            </button>
          </div>

          {(testResult || result) && (
            <div className="space-y-3 border-t border-gray-100 px-5 py-4">
              {testResult && (
                <div className={testResult.error ? 'alert-error' : 'alert-info'}>
                  <div className="min-w-0 w-full">
                    <p className="font-medium">{testResult.error ? 'Connection failed' : 'Connection test result'}</p>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(testResult, null, 2)}</pre>
                  </div>
                </div>
              )}
              {result && (result.ok ? (
                <div className="alert-success">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Import complete</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {result.totals && Object.entries(result.totals).map(([k, v]) => (
                        <li key={k} className="tabular-nums">{v} {k} in the database, {result.imported?.[k] ?? 0} new</li>
                      ))}
                      {!result.totals && result.imported && Object.entries(result.imported).map(([k, v]) => (
                        <li key={k} className="tabular-nums">{v} new {k}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="alert-error"><span className="break-all font-mono text-xs">{String(result.error)}</span></div>
              ))}
            </div>
          )}
        </section>

        <aside className="card self-start p-5 text-[13px] text-gray-600 space-y-3">
          <p className="font-medium text-gray-900">Before you run it</p>
          <p>The import reads Airtable with the <span className="mono text-xs">AIRTABLE_TOKEN</span> environment variable. Use Test connection first to confirm it is set.</p>
          <p>Afterwards, review the results in <a href="/inventory/products" className="font-medium text-gray-900 underline-offset-2 hover:underline">Products</a>, <a href="/inventory/suppliers" className="font-medium text-gray-900 underline-offset-2 hover:underline">Suppliers</a> and <a href="/clients" className="font-medium text-gray-900 underline-offset-2 hover:underline">Clients</a>.</p>
        </aside>
      </div>

      <SampleDataCard />
    </div>
  )
}

export default function ImportPageGuarded() {
  return <Gate admin><ImportPage /></Gate>
}
