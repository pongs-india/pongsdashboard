# Build log

| Date       | Area | Status | Notes |
|------------|------|--------|-------|
| 2026-10-21 | Database | done | Turso → Supabase Postgres (US East); schema versioned, migrations once per version, RLS on every table |
| 2026-10-21 | Performance | done | Analytics 128s → ~1s (lock contention from per-request DDL); finance N+1 removed; one /api/auth/me per session; client-side navigation; Inter via next/font; Vercel region iad1 |
| 2026-10-21 | Design tokens | done | tokens.json, 21/21 pairs pass WCAG AA; Tailwind roles; cool neutrals, blue accent, distinct success |
| 2026-10-21 | Brand | done | Pongs India logo (light + white), app/Apple icons from the wave mark |
| 2026-10-21 | App shell | done | Grouped nav, ⌘K command menu with record search, skip link, aria-current |
| 2026-10-21 | All screens | done | Restyled through shared primitives (buttons, inputs, tables, badges, cards, modals, charts) |
| 2026-10-21 | States | done | error/not-found/global-error/loading routes; stat skeletons; user-menu placeholder |
| 2026-10-21 | Security | done | Open redirect on sign-in closed; security headers; API no-store |
| next       | Dashboard API | todo | One /api/dashboard summary endpoint instead of 8 list requests |
| next       | Tables | todo | Sortable columns and pagination on quotes, clients, products |
| next       | Charts | todo | Lazy-load recharts on inventory/analytics (≈100 kB) |
