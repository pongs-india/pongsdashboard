'use client'

// Last-resort boundary for errors in the root layout itself (the app shell
// is unavailable here, so this renders its own minimal document).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f8fa', color: '#16191e', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Pongs India is having trouble loading</h1>
          <p style={{ fontSize: 13, color: '#5d6571' }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #1c47b4', background: '#2459d8', color: '#fff', fontWeight: 500, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  )
}
