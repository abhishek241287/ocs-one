---
name: ODS 2.0 Component Registry
description: The discipline rule for the ODS design system plus the non-obvious focus/keyboard standards. Component list is grep-able from src/components/ods/index.ts.
---

# ODS Design System — durable policy

**The rule:** No module may build its own table, toolbar, drawer, dialog, search bar, or other interactive UI. If the pattern doesn't exist in ODS, add it to ODS first, then use it. Everything is barrel-exported from `@/components/ods`; design tokens from `@/ods/theme` (Tailwind class strings only — no raw CSS values). The in-app `/design-system` route is the live catalogue. To see what components exist, read `src/components/ods/index.ts` — don't rely on a list here going stale.

**Notification rule:** modules must never call `useToast()` directly — always `useOdsNotify()` semantic variants, so UX stays consistent.

## ODS Standard 15 — Keyboard Table Navigation (mandatory)
Every data table must be fully operable mouse-free. Engine is the `useTableKeyboardNav` hook — reuse it for any bespoke/raw table that can't use OdsDataTable directly.

- **Gotcha (real regression caught in review):** the keydown handler sits on the table *container*, so it MUST bail out when the event target is (or is inside) an interactive descendant — `input, textarea, select, button, a[href], [role=button/menuitem/link], contenteditable` — via `target.closest(...)`. Without this it swallows Enter/Space meant for row action buttons.
- **A11y:** a focusable wrapper around a native `<table>` uses `role="group"` + aria-label, NOT `role="grid"` — we don't implement the full grid widget pattern, and claiming `grid` gives screen readers false semantics.

## ODS Standard 16 — Focus Management (mandatory)
Every interactive component must define & satisfy all five guarantees before shipping: (1) initial focus on open, (2) focus trap while open for overlays, (3) focus restoration to trigger on close, (4) visible focus-visible indicator, (5) predictable keyboard escape (Esc).

- **Why:** CTO-mandated — a keyboard user must always know where focus is and never lose it.
- **How to apply / honesty discipline:** most overlays comply for free via Radix/shadcn/cmdk, but **do not mark a component compliant without checking its real implementation** — a prior draft falsely claimed OdsSearchBar had Esc-to-clear before the handler actually existed. Mark components verified / pending, never blanket-✅. There is no dedicated ODS date-picker yet (only a `ui/calendar` primitive) — that guarantee is pending until one is built.
