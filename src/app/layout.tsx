import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'
import { FeedbackHost } from '@/components/feedback'

// Self-hosted at build time: no render-blocking request to Google, no layout shift.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Pongs India', template: '%s · Pongs India' },
  description: 'Quotations, projects and inventory for Pongs India stretch ceilings',
  applicationName: 'Pongs India',
}

export const viewport: Viewport = {
  themeColor: '#f7f8fa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
        <FeedbackHost />
      </body>
    </html>
  )
}
