'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Save, Loader2, BookUser, Trash2, ChevronDown, Search, Calculator } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useRouter } from 'next/navigation'
import CeilingItemForm, { defaultItem } from './CeilingItemForm'
import type { Quote, CeilingItem, PriceTier, QuoteDisplayMode, ManualRates, CustomLine } from '@/lib/types'
import { calculateQuote, fmtINR } from '@/lib/calculations'
import { listClients, saveClient, deleteClient, type SavedClient } from '@/lib/clients'
import { listCompanies, DEFAULT_COMPANY } from '@/lib/companies'
import { PageHeader, Field, Switch, OptionCards } from '@/components/ui'
import { DatePicker, Combobox } from '@/components/controls'
import { toast } from '@/components/feedback'

interface Props {
  initial?: Quote
  mode: 'new' | 'edit'
  title: string
  description?: string
}

export default function QuoteBuilder({ initial, mode, title, description }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [savingInternal, setSavingInternal] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const [meta, setMeta] = useState({
    clientName: initial?.clientName ?? '',
    clientEmail: initial?.clientEmail ?? '',
    clientPhone: initial?.clientPhone ?? '',
    projectName: initial?.projectName ?? '',
    location: initial?.location ?? '',
    date: initial?.date ?? today,
    validUntil: initial?.validUntil ?? validUntil,
    priceTier: (initial?.priceTier ?? 'msp') as PriceTier,
    markupPercent: initial?.markupPercent ?? 0,
    installationRatePerSqft: initial?.installationRatePerSqft ?? 120,
    transportCost: initial?.transportCost ?? 0,
    includeGst: initial?.includeGst ?? false,
    displayMode: (initial?.displayMode ?? 'total') as QuoteDisplayMode,
    notes: initial?.notes ?? '',
    company: initial?.company ?? DEFAULT_COMPANY,
  })

  const [manualRates, setManualRates] = useState<ManualRates>(
    initial?.manualRates ?? { fabricPerSqm: 0, ledPerMtr: 0, gripperPerRmt: 0, otherItemsTier: 'msp' }
  )

  const [items, setItems] = useState<CeilingItem[]>(
    initial?.items?.length ? initial.items : [defaultItem(uuid())]
  )

  // Feature 4 — free-form rows for the Manual (Custom) tab.
  const [customLines, setCustomLines] = useState<CustomLine[]>(
    initial?.customLines?.length ? initial.customLines : [{ id: uuid(), description: '', qty: 1, cost: 0, sellingPrice: 0 }]
  )
  const isCustom = meta.priceTier === 'manual_custom'
  const CUSTOM_ITEM_SUGGESTIONS = [
    'Stretch Ceiling Fabric', 'Printed Fabric', 'Acoustic Fabric', 'Translucent Fabric',
    'LED Strip', 'LED Driver', 'DALI Controller', 'Gripper Track', 'Profile',
    'Installation', 'Transport', 'Fabrication', 'Site Survey', 'Miscellaneous',
  ]
  function updateCustomLine(id: string, patch: Partial<CustomLine>) {
    setCustomLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function addCustomLine() {
    setCustomLines(prev => [...prev, { id: uuid(), description: '', qty: 1, cost: 0, sellingPrice: 0 }])
  }
  function removeCustomLine(id: string) {
    setCustomLines(prev => prev.filter(l => l.id !== id))
  }
  const customTotal = customLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.sellingPrice) || 0), 0)

  const [preview, setPreview] = useState<ReturnType<typeof calculateQuote> | null>(null)
  const [clients, setClients] = useState<SavedClient[]>([])
  const [showClientBook, setShowClientBook] = useState(false)
  const [clientQuery, setClientQuery] = useState('')

  useEffect(() => { setClients(listClients()) }, [])

  function loadClient(c: SavedClient) {
    setMeta(m => ({
      ...m,
      clientName: c.name,
      clientEmail: c.email,
      clientPhone: c.phone,
      location: c.location,
      priceTier: c.priceTier as PriceTier,
      markupPercent: c.markupPercent,
    }))
    setShowClientBook(false)
  }

  function saveCurrentClient() {
    if (!meta.clientName.trim()) { toast('Enter a client name first', { tone: 'info' }); return }
    const existing = clients.find(c => c.name.toLowerCase() === meta.clientName.toLowerCase())
    const client: SavedClient = {
      id: existing?.id ?? uuid(),
      name: meta.clientName,
      email: meta.clientEmail,
      phone: meta.clientPhone,
      location: meta.location,
      priceTier: meta.priceTier,
      markupPercent: meta.markupPercent,
      notes: '',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    saveClient(client)
    setClients(listClients())
    toast(`${client.name} saved to the client book`)
  }

  function removeClient(id: string) {
    deleteClient(id)
    setClients(listClients())
  }

  const updatePreview = useCallback(() => {
    try {
      const fakeQuote: Quote = {
        id: '', quoteNumber: '', createdAt: '', updatedAt: '',
        ...meta,
        items,
        manualRates: meta.priceTier === 'manual' ? manualRates : undefined,
        customLines: meta.priceTier === 'manual_custom' ? customLines : undefined,
      }
      setPreview(calculateQuote(fakeQuote))
    } catch {
      setPreview(null)
    }
  }, [meta, items, manualRates, customLines])

  useEffect(() => { updatePreview() }, [updatePreview])

  function addItem() {
    setItems(prev => [...prev, defaultItem(uuid())])
  }

  function updateItem(idx: number, item: CeilingItem) {
    setItems(prev => prev.map((p, i) => i === idx ? item : p))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveQuote(redirectTo: 'team' | 'internal' = 'team') {
    if (!meta.clientName.trim()) { toast('Enter a client name', { tone: 'error', description: 'A quote needs a client before it can be saved.' }); return }
    if (isCustom) {
      if (!customLines.some(l => l.description.trim())) { toast('Add at least one line item', { tone: 'error' }); return }
    } else if (items.length === 0) { toast('Add at least one ceiling item', { tone: 'error' }); return }

    const isInternal = redirectTo === 'internal'
    if (isInternal) setSavingInternal(true)
    else setSaving(true)

    try {
      const payload = {
        ...meta, items,
        manualRates: meta.priceTier === 'manual' ? manualRates : undefined,
        customLines: isCustom ? customLines : undefined,
      }
      const url = mode === 'edit' ? `/api/quotes/${initial!.id}` : '/api/quotes'
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.text()
        toast('The quote could not be saved', { tone: 'error', description: `The server returned ${res.status}${err ? `: ${err.slice(0, 160)}` : ''}` })
        setSaving(false); setSavingInternal(false)
        return
      }
      const savedQ = await res.json()
      if (!savedQ?.id) {
        toast('The quote could not be saved', { tone: 'error', description: 'The server sent an unexpected response.' })
        setSaving(false); setSavingInternal(false)
        return
      }
      if (isInternal) {
        setSavingInternal(false)
        router.push(`/quotes/${savedQ.id}/internal`)
      } else {
        setSaving(false)
        router.push(`/quotes/${savedQ.id}/team`)
      }
    } catch (e) {
      toast('The quote could not be saved', { tone: 'error', description: String(e) })
      setSaving(false); setSavingInternal(false)
    }
  }

  function handleSave() { return saveQuote('team') }


  const TIER_OPTIONS: { value: PriceTier; label: string; note: string }[] = [
    { value: 'dealer', label: 'Dealer', note: 'Dealer price list' },
    { value: 'msp', label: 'MSP', note: 'Market selling price' },
    { value: 'specifiors', label: 'Specifier', note: 'Architects and specifiers' },
    { value: 'manual', label: 'Manual rates', note: 'Set fabric, LED, gripper rates' },
    { value: 'manual_custom', label: 'Custom lines', note: 'Free-form rows, no engine' },
  ]

  const filteredClients = clients.filter(c =>
    !clientQuery || `${c.name} ${c.location} ${c.email}`.toLowerCase().includes(clientQuery.toLowerCase()))

  const saveLabel = mode === 'edit' ? 'Save changes' : 'Save quote'

  // ⌘S / Ctrl+S saves, like any desktop editor (and stops the browser's "Save page").
  const saveRef = useRef(handleSave)
  saveRef.current = handleSave
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="pb-20 xl:pb-0">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {mode === 'edit' && initial && <a href={`/quotes/${initial.id}/team`} className="btn-ghost">Cancel</a>}
            <button onClick={() => saveQuote('internal')} disabled={savingInternal || saving} className="btn-secondary">
              {savingInternal ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Calculator size={15} /> Save and review costs</>}
            </button>
            <button onClick={handleSave} disabled={saving || savingInternal} className="btn-primary" title="Save (⌘S)">
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> {saveLabel}</>}
            </button>
          </>
        }
      />

      {/* Below desktop the summary sits at the end of a long form: keep the
          running total and the save action within reach. */}
      <div className="xl:hidden fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-2.5 lg:left-[var(--sidebar-w)]"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-medium text-gray-500">Grand total</p>
            <p className="truncate text-base font-semibold tabular-nums text-gray-900">{preview ? fmtINR(preview.grandTotal) : "—"}</p>
          </div>
          <button onClick={handleSave} disabled={saving || savingInternal} className="btn-primary shrink-0">
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> {saveLabel}</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Main form */}
        <div className="space-y-5 min-w-0">

          {/* Client and project */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
              <div>
                <h2 className="card-title">Client and project</h2>
                <p className="text-xs text-gray-500 mt-0.5">Who the quotation is for and where the work is.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button type="button" onClick={() => setShowClientBook(v => !v)} className="btn-secondary btn-sm" aria-expanded={showClientBook}>
                    <BookUser size={14} /> Client book
                    {clients.length > 0 && <span className="text-gray-400 tabular-nums">{clients.length}</span>}
                    <ChevronDown size={13} className="text-gray-400" />
                  </button>
                  {showClientBook && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowClientBook(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-30 w-80 rounded-lg border border-gray-200 bg-white shadow-lg animate-scale-in origin-top-right">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input autoFocus className="input h-8 pl-8" placeholder="Search saved clients" value={clientQuery} onChange={e => setClientQuery(e.target.value)} />
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-1">
                          {filteredClients.length === 0 && (
                            <p className="px-3 py-6 text-center text-xs text-gray-500">
                              {clients.length === 0 ? 'No saved clients yet. Fill in the details and choose Save to client book.' : 'No clients match.'}
                            </p>
                          )}
                          {filteredClients.map(c => (
                            <div key={c.id} className="group flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-gray-100">
                              <button type="button" onClick={() => loadClient(c)} className="min-w-0 flex-1 text-left">
                                <p className="truncate text-[13px] font-medium text-gray-900">{c.name}</p>
                                <p className="truncate text-xs text-gray-500">
                                  {[c.location, c.priceTier.toUpperCase(), c.markupPercent ? `+${c.markupPercent}%` : null].filter(Boolean).join(' · ')}
                                </p>
                              </button>
                              <button type="button" onClick={() => removeClient(c.id)} aria-label={`Remove ${c.name}`}
                                className="btn-ghost btn-icon h-7 w-7 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-700">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button type="button" onClick={saveCurrentClient} className="btn-ghost btn-sm">Save to client book</button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Company selector (required) — determines quotation branding */}
              <div>
                <span className="label">Issuing company<span className="text-red-600 ml-0.5">*</span></span>
                <OptionCards
                  value={meta.company}
                  onChange={v => setMeta(m => ({ ...m, company: v }))}
                  options={listCompanies().map(c => ({ value: c.id, label: c.shortName, note: c.name }))}
                  columns="grid-cols-2 sm:grid-cols-3"
                />
                <p className="hint">Sets the name, address, GST and bank details on the PDF. Pricing is identical for both.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Client name" required>
                  <input className="input" placeholder="Company or person"
                    value={meta.clientName} onChange={e => setMeta(m => ({ ...m, clientName: e.target.value }))} />
                </Field>
                <Field label="Project name">
                  <input className="input" placeholder="Villa living room"
                    value={meta.projectName} onChange={e => setMeta(m => ({ ...m, projectName: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <input type="email" className="input" placeholder="client@company.com"
                    value={meta.clientEmail} onChange={e => setMeta(m => ({ ...m, clientEmail: e.target.value }))} />
                </Field>
                <Field label="Phone">
                  <input type="tel" className="input" placeholder="+91 98765 43210"
                    value={meta.clientPhone} onChange={e => setMeta(m => ({ ...m, clientPhone: e.target.value }))} />
                </Field>
                <Field label="Site location" className="sm:col-span-2">
                  <input className="input" placeholder="Area, city"
                    value={meta.location} onChange={e => setMeta(m => ({ ...m, location: e.target.value }))} />
                </Field>
                <Field label="Quote date">
                  <DatePicker clearable={false} ariaLabel="Quote date"
                    value={meta.date} onChange={v => setMeta(m => ({ ...m, date: v }))} />
                </Field>
                <Field label="Valid until">
                  <DatePicker ariaLabel="Valid until"
                    value={meta.validUntil} onChange={v => setMeta(m => ({ ...m, validUntil: v }))} />
                </Field>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section className="card">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <h2 className="card-title">Pricing</h2>
              <p className="text-xs text-gray-500 mt-0.5">Price list, adjustments and how totals appear to the client.</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <span className="label">Price list</span>
                <OptionCards
                  value={meta.priceTier}
                  onChange={v => setMeta(m => ({ ...m, priceTier: v }))}
                  options={TIER_OPTIONS}
                  columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                />
              </div>

              {meta.priceTier === 'manual' && (
                <div className="rounded-md border border-gray-200 bg-gray-50/70 p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Fabric (₹ per sqm)">
                      <input type="number" min="0" step="10" className="input tabular-nums" placeholder="1100"
                        value={manualRates.fabricPerSqm || ''}
                        onChange={e => setManualRates(r => ({ ...r, fabricPerSqm: parseFloat(e.target.value) || 0 }))} />
                    </Field>
                    <Field label="LED (₹ per m)">
                      <input type="number" min="0" step="10" className="input tabular-nums" placeholder="350"
                        value={manualRates.ledPerMtr || ''}
                        onChange={e => setManualRates(r => ({ ...r, ledPerMtr: parseFloat(e.target.value) || 0 }))} />
                    </Field>
                    <Field label="Gripper (₹ per rmt)">
                      <input type="number" min="0" step="5" className="input tabular-nums" placeholder="170"
                        value={manualRates.gripperPerRmt || ''}
                        onChange={e => setManualRates(r => ({ ...r, gripperPerRmt: parseFloat(e.target.value) || 0 }))} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">Drivers, controls, printing and fleece</p>
                      <p className="text-xs text-gray-500">Priced from this list.</p>
                    </div>
                    <div className="segmented" role="radiogroup" aria-label="Price list for other items">
                      {(['dealer', 'msp', 'specifiors'] as const).map(t => (
                        <button key={t} type="button" role="radio" aria-checked={manualRates.otherItemsTier === t}
                          data-active={manualRates.otherItemsTier === t}
                          onClick={() => setManualRates(r => ({ ...r, otherItemsTier: t }))}>
                          {t === 'msp' ? 'MSP' : t === 'specifiors' ? 'Specifier' : 'Dealer'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {!isCustom && (
                  <Field label="Additional markup (%)">
                    <input type="number" min="0" max="200" className="input tabular-nums"
                      value={meta.markupPercent}
                      onChange={e => setMeta(m => ({ ...m, markupPercent: parseFloat(e.target.value) || 0 }))} />
                  </Field>
                )}
                {!isCustom && (
                  <Field label="Installation (₹ per sqft)">
                    <input type="number" min="0" className="input tabular-nums"
                      value={meta.installationRatePerSqft}
                      onChange={e => setMeta(m => ({ ...m, installationRatePerSqft: parseFloat(e.target.value) || 0 }))} />
                  </Field>
                )}
                <Field label="Transport (₹ flat)">
                  <input type="number" min="0" className="input tabular-nums"
                    value={meta.transportCost}
                    onChange={e => setMeta(m => ({ ...m, transportCost: parseFloat(e.target.value) || 0 }))} />
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <Switch checked={meta.includeGst} onChange={v => setMeta(m => ({ ...m, includeGst: v }))}
                  label="Add GST at 18%" description="Shown as a separate line on the quotation." />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Show client</span>
                  <div className="segmented" role="radiogroup" aria-label="Display mode">
                    {(['total', 'per-sqft'] as QuoteDisplayMode[]).map(m => (
                      <button key={m} type="button" role="radio" aria-checked={meta.displayMode === m}
                        data-active={meta.displayMode === m}
                        onClick={() => setMeta(mm => ({ ...mm, displayMode: m }))}>
                        {m === 'total' ? 'Total price' : 'Price per sqft'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Custom rows (Manual Custom) or Ceiling items */}
          {isCustom ? (
            <section className="card">
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                <h2 className="card-title">Line items</h2>
                <p className="text-xs text-gray-500 mt-0.5">Every value is used exactly as entered. No automatic pricing is applied.</p>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num w-[84px]">Qty</th>
                      <th className="num w-[120px]">Cost (₹)</th>
                      <th className="num w-[120px]">Selling (₹)</th>
                      <th className="num w-[120px]">Amount</th>
                      <th className="w-12"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customLines.map((l) => {
                      const amount = (Number(l.qty) || 0) * (Number(l.sellingPrice) || 0)
                      return (
                        <tr key={l.id}>
                          <td className="py-2 min-w-[200px]">
                            <Combobox suggestions={CUSTOM_ITEM_SUGGESTIONS} placeholder="Choose or type an item" ariaLabel="Item"
                              value={l.description} onChange={v => updateCustomLine(l.id, { description: v })} />
                          </td>
                          <td className="py-2">
                            <input type="number" min="0" step="1" className="input text-right tabular-nums" placeholder="1" aria-label="Quantity"
                              value={l.qty || ''} onChange={e => updateCustomLine(l.id, { qty: parseFloat(e.target.value) || 0 })} />
                          </td>
                          <td className="py-2">
                            <input type="number" min="0" step="1" className="input text-right tabular-nums" placeholder="0" aria-label="Cost"
                              value={l.cost || ''} onChange={e => updateCustomLine(l.id, { cost: parseFloat(e.target.value) || 0 })} />
                          </td>
                          <td className="py-2">
                            <input type="number" min="0" step="1" className="input text-right tabular-nums" placeholder="0" aria-label="Selling price"
                              value={l.sellingPrice || ''} onChange={e => updateCustomLine(l.id, { sellingPrice: parseFloat(e.target.value) || 0 })} />
                          </td>
                          <td className="num py-2 font-medium text-gray-900">{fmtINR(amount)}</td>
                          <td className="py-2 text-right">
                            <button type="button" onClick={() => removeCustomLine(l.id)} title="Remove row" aria-label="Remove row"
                              disabled={customLines.length === 1}
                              className="btn-ghost btn-icon text-gray-400 hover:text-red-700">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-2.5">
                <button type="button" onClick={addCustomLine} className="btn-ghost btn-sm"><Plus size={14} /> Add row</button>
                <span className="text-[13px] text-gray-500">Lines total <span className="ml-2 font-semibold text-gray-900 tabular-nums">{fmtINR(customTotal)}</span></span>
              </div>
            </section>
          ) : (
            <section>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <h2 className="section-title">Ceiling items</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}. Each is priced from its dimensions, fabric and lighting.</p>
                </div>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <CeilingItemForm
                    key={item.id}
                    item={item}
                    index={idx}
                    priceTier={meta.priceTier}
                    installRatePerSqft={meta.installationRatePerSqft}
                    manualRates={meta.priceTier === 'manual' ? manualRates : undefined}
                    onChange={updated => updateItem(idx, updated)}
                    onRemove={() => removeItem(idx)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addItem}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 h-11 text-[13px] font-medium text-gray-600 hover:border-gray-400 hover:bg-white hover:text-gray-900 transition-colors"
              >
                <Plus size={15} /> Add ceiling item
              </button>
            </section>
          )}

          {/* Notes */}
          <section className="card">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <h2 className="card-title">Notes and terms</h2>
              <p className="text-xs text-gray-500 mt-0.5">Printed on the client quotation.</p>
            </div>
            <div className="p-5">
              <textarea className="input resize-y" rows={4}
                placeholder="Payment terms, exclusions, site conditions"
                value={meta.notes}
                onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))} />
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="xl:sticky xl:top-20 space-y-3">
          <section className="card">
            <div className="card-header">
              <h3 className="card-title">Summary</h3>
              <span className="text-xs text-gray-500">{meta.company} · {TIER_OPTIONS.find(t => t.value === meta.priceTier)?.label}</span>
            </div>
            {preview ? (
              <div className="px-5 py-4">
                <dl className="space-y-2 text-[13px]">
                  {preview.itemBreakdowns.map((bd, idx) => (
                    <div key={bd.item.id} className="flex items-baseline justify-between gap-3">
                      <dt className="truncate text-gray-600">{bd.item.name || `Item ${idx + 1}`}</dt>
                      <dd className="shrink-0 font-medium text-gray-900 tabular-nums">{fmtINR(bd.itemTotal)}</dd>
                    </div>
                  ))}
                  {meta.transportCost > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <dt>Transport</dt>
                      <dd className="tabular-nums">{fmtINR(meta.transportCost)}</dd>
                    </div>
                  )}
                  {preview.gstAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <dt>GST 18%</dt>
                      <dd className="tabular-nums">{fmtINR(preview.gstAmount)}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-gray-900">Total</span>
                  <span className="text-[22px] font-semibold tracking-tight text-gray-900 tabular-nums">{fmtINR(preview.grandTotal)}</span>
                </div>
                <p className="mt-1 text-right text-xs text-gray-500">
                  {[meta.markupPercent > 0 ? `${meta.markupPercent}% markup` : null, meta.includeGst ? 'Including GST' : 'Excluding GST'].filter(Boolean).join(' · ')}
                </p>
                {preview.totalSqft > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <p className="text-2xs text-gray-500">Area</p>
                      <p className="text-[13px] font-medium text-gray-900 tabular-nums">{preview.totalSqft.toFixed(1)} sqft</p>
                    </div>
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <p className="text-2xs text-gray-500">Rate</p>
                      <p className="text-[13px] font-medium text-gray-900 tabular-nums">₹{Math.round(preview.pricePerSqft).toLocaleString('en-IN')}/sqft</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-[13px] text-gray-500">Add item dimensions to see the total.</p>
            )}
            <div className="border-t border-gray-100 p-3 space-y-2">
              <button onClick={handleSave} disabled={saving || savingInternal} className="btn-primary w-full">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> {saveLabel}</>}
              </button>
              <button onClick={() => saveQuote('internal')} disabled={savingInternal || saving} className="btn-secondary w-full">
                {savingInternal ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save and review costs'}
              </button>
            </div>
          </section>

          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 h-11 text-[13px] font-medium text-gray-700">
              How quantities are calculated
              <ChevronDown size={15} className="text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 border-t border-gray-100 px-5 py-4 text-xs leading-relaxed text-gray-600">
              <li>Fabric cut length and gripper perimeter use exact dimensions, without rounding.</li>
              <li>A joint can be added to any rectangle.</li>
              <li>LED strips run across the shorter side at the chosen gap (default 125 mm). Length rounds up to the next 1 m module.</li>
              <li>Circles use 80% of the LED count for the equivalent bounding square.</li>
              <li>DALI tunable: DT8 150W, maximum 10 modules, plus one DA4m per 3 drivers.</li>
              <li>Standard tunable or dimmable: 200W, 450W or 600W drivers with EV2, V2 and RT2.</li>
              <li>Single colour: drivers loaded to 80% with EV1, V1 and RT1.</li>
            </ul>
          </details>
        </aside>
      </div>
    </div>
  )
}
