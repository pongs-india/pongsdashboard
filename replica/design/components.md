# Pongs India components

Every component reads the tokens in `tokens.json` (via Tailwind roles and the
custom properties in `src/app/globals.css`). No raw hex in components; chart
values live in `src/components/charts.tsx`.

```
Button            .btn-primary .btn-secondary .btn-ghost .btn-danger .btn-destructive .btn-link
  sizes           md 36px (default), sm 32px (.btn-sm), xs 28px (.btn-xs), icon 32px (.btn-icon)
  states          default, hover, active, focus-visible (3px accent ring), disabled (50%), busy (aria-busy)
  rules           one primary per view; destructive actions confirm through confirmDialog()
  a11y            real <button> or <a>; icon-only buttons carry aria-label

Input / Select    .input .select textarea.input, wrapped in <Field> (label, hint, required)
  size            36px; login uses 40px
  states          default, hover, focus (accent border + ring), invalid (aria-invalid), disabled
  a11y            border-input role 3.1:1; every control has a visible label

Checkbox / Radio / Switch   .checkbox .radio, <Switch> (role=switch)

Card              .card, <Card title description actions>; .card-header, .card-title, .card-link
Stat              <Stat label value hint tone href>; value=null renders a skeleton
Table             .table-wrap > .table-scroll > table.table(.table-hover); .num for figures; .table-footer
  rows            clickable rows use navigate(href, e): Cmd/Ctrl-click opens a new tab
Badge             <StatusBadge status>: neutral, info, success, warning, danger; tone per status in ui.tsx
Tabs              .tabs/.tab[data-active], segmented control .segmented (aria-pressed buttons)
Chip              .chip[data-active] filter pills
Modal             <Modal title footer width>; confirmDialog(), toast() in feedback.tsx
Alert             .alert-error .alert-success .alert-warning .alert-info (role=alert for errors)
Empty state       <EmptyState icon title description action compact>
Loading           <PageLoading>, <LoadingRows>, .skeleton; route-level loading.tsx
Errors            app/error.tsx (retry + reference), app/not-found.tsx, app/global-error.tsx
Guidance          <NextStep>, <Stepper>, <GettingStarted>, <AttentionCard>

App shell         sidebar 240px (logo, ⌘K search, grouped nav, user menu), top bar 52px
                  (breadcrumbs, notifications, New quote), content max 1440px, skip link
Command menu      ⌘K / Ctrl+K: pages, quick actions, quotes/clients/projects search;
                  combobox + listbox semantics, arrow keys, Enter, Esc, focus restored
```
