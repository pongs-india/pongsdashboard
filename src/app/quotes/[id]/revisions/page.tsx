import { dbGetQuote, dbGetProjectIdForQuote } from '@/lib/db'
import { canAccessQuote } from '@/lib/session'
export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import QuoteHeader from '@/components/QuoteHeader'
import RevisionTrail from '@/components/RevisionTrail'

export default async function RevisionTrailPage({ params }: { params: { id: string } }) {
  const quote = await dbGetQuote(params.id)
  if (!quote) notFound()
  if (!(await canAccessQuote(quote.ownerEmail))) notFound()
  const projectId = await dbGetProjectIdForQuote(quote.id)

  return (
    <div className="page">
      <QuoteHeader quote={quote} active="revisions" projectId={projectId} printable={false} />
      <RevisionTrail quoteId={quote.id} />
    </div>
  )
}
