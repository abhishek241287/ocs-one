---
name: ODS 2.0 Component Registry
description: All ODS components, tokens, and the discipline rule — no UI outside ODS.
---

# ODS Design System — Component Registry

**Rule:** No module may build its own table, toolbar, drawer, dialog, or search bar. Add to ODS first.

## Barrel export
`import { X } from "@/components/ods"` — all components exported from `src/components/ods/index.ts`

## Foundation (Phase 1 rollout)
- `ModuleHeader` — icon + title + description + cert badge + actions slot
- `OdsCertBadge` — certified / under-validation / development
- `OdsStatusBadge` — semantic green/blue/yellow/red/gray from status string
- `OdsEmptyState` — icon + title + description + optional CTA
- `OdsTableSkeleton` — animated row skeleton for loading states

## Core Components (Phase 2 — ODS 2.0)
- `OdsSearchBar` — debounced search, clear button, Ctrl+F focus capture, ref-forwarding
- `OdsToolbar` — search + filters slot + refresh + actions slot (right-aligned)
- `OdsDrawer` — standard Sheet-based drawer; sizes sm/md/lg/xl/2xl; sticky header+footer; Ctrl+S; error display
- `OdsDialog` — confirm/delete/warning dialogs; variants: default|danger|warning|success|confirm; Enter key confirm
- `OdsDataTable` — full TanStack table: sorting, column visibility, density (compact/default/comfortable), row actions slot, pagination, loading, empty state. Built-in keyboard nav (ODS Standard 15) via `useTableKeyboardNav`, `enableKeyboardNav` default on; callbacks `onRowEnter`/`onRowHistory`/`onRowSelect`.

## ODS Standard 15 — Keyboard Table Navigation (mandatory)
- Every data table must be fully operable mouse-free. Engine: `useTableKeyboardNav` hook — reuse it for any bespoke/raw table that can't use OdsDataTable directly (e.g. tables with expandable detail rows).
- Bindings: ↑/↓ move active row · Home/End first/last · Enter open/edit · H history · Space toggle select · Esc clear.
- **Gotcha:** the keydown handler sits on the table *container*, so it must bail out when the event target is (or is inside) an interactive descendant — `input, textarea, select, button, a[href], [role=button/menuitem/link], contenteditable` — via `target.closest(...)`. Without this it swallows Enter/Space meant for row action buttons (a real regression caught in review).
- **A11y:** focusable wrapper around a native `<table>` uses `role="group"` + aria-label, NOT `role="grid"` (we don't implement the full grid widget pattern, so claiming it gives screen readers mixed/false semantics).
- Documented on the in-app `/design-system` page under OdsDataTable.

## Command Palette (Phase 2)
- `OdsCommandPalette` — Ctrl+K global; fuzzy search over all routes/modules; rendered in App.tsx

## Developer Mode (Phase 9)
- `DevModeProvider` — wraps app in App.tsx; Ctrl+Shift+D toggle; persists in localStorage
- `useDevMode()` — hook to read enabled state and register page debug info
- `DevModePageInfo` — type for page-level debug metadata (component, API endpoints, query keys, cert)

## Notification System
- `useOdsNotify()` — `notify.success/error/warning/info(title, opts?)`; wraps shadcn toast with emoji prefixes
- **Why:** Modules must never call `useToast()` directly — semantic variants ensure consistent UX

## Design Tokens
- Location: `src/ods/theme/` — `colors.ts`, `spacing.ts`, `typography.ts`, `index.ts`
- Usage: `import { ods } from "@/ods/theme"` → `ods.colors.status.success.bg`, `ods.typography.heading.h1`, etc.
- All values are Tailwind class strings — no raw CSS values in ODS components

## Component Showcase
- Route: `/design-system` — auth-protected internal catalogue
- Shows every component + token swatches + live interactive demos

## Master Page pattern
- `MasterPage<T>` uses OdsDataTable with OdsToolbar toolbar slot; appends status + actions columns inline
- `MasterEditDrawer` uses OdsDrawer shell with form validation logic inside
- `OdsDialog` for deactivate/activate confirmation (variant="warning")

**How to apply:** When adding new UI to any module, pick the matching ODS component. If the pattern doesn't exist in ODS yet, add it to ODS first, then use it.
