'use client'
import { useEffect } from 'react'

// Client pages can't export metadata, so the page heading names the browser tab.
export default function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · Pongs India`
    return () => { document.title = previous }
  }, [title])
  return null
}
