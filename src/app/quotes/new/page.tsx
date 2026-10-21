import QuoteBuilder from '@/components/QuoteBuilder'


export default function NewQuotePage() {
  return (
    <QuoteBuilder
      mode="new"
      title="New quotation"
      description="Totals recalculate as you edit. Nothing is saved until you choose Save quote."
    />
  )
}
