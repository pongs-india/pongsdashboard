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
| 2026-10-21 | DB resilience | done | One query per pooled connection (no pipelining through Supavisor); 20s query timeout rebuilds the pool instead of hanging every request |
| 2026-10-21 | Tables | done | Shared table kit: sortable headers (aria-sort), 25-row paging, CSV export (Excel-safe, formula-injection safe), URL-backed filters. Quotes, clients, projects, products, finance, users |
| 2026-10-21 | Data safety | done | Product save failures keep the form open; quote status change rolls back on failure; list load errors show reason + retry |
| 2026-10-21 | Loading states | done | Skeletons were invisible (removed CSS var) — fixed app-wide; project money cards no longer show ₹0 / Fully paid while loading |
| 2026-10-21 | Dashboard API | done | /api/dashboard/counts replaces four full-list downloads |
| 2026-10-21 | Session UX | done | Expired sessions redirect to sign-in with return path; tab titles per page/record |
| 2026-10-21 | Quote builder | done | Sticky total + save bar below desktop width; Cmd/Ctrl+S |
| next       | Tables | todo | Same table kit on purchases, suppliers, movements, access requests |
| next       | Charts | todo | Lazy-load recharts on inventory/analytics (≈100 kB of the 200 kB) |
| next       | Server pagination | todo | Lists load everything client-side; fine at today's volume, move paging to SQL past a few thousand rows |
