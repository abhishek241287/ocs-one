# OCS One Design Standards

> Every screen, form, dialog, and workflow in OCS One follows these rules.
> Consistency reduces factory staff training time and makes every module feel familiar.

---

## Keyboard Shortcuts

Every module implements these shortcuts without exception.

| Shortcut | Action | Notes |
|---|---|---|
| `Enter` | Next field | Input fields only (not textarea, not Select) |
| `Shift+Enter` | Previous field | Input fields only |
| `Ctrl/⌘+S` | Save form | Works from any field inside the form |
| `Ctrl/⌘+N` | New record | Opens the Add/Create drawer or dialog for the current module |
| `F2` | Edit selected record | Fires on the last row clicked/selected |
| `Esc` | Cancel / Close | Handled natively by Radix Sheet/Dialog |
| `Tab` | Browser default | Not overridden |
| `Ctrl/⌘+F` | Focus module search | Only active when the app has focus; prevents browser Find |

### Rules

- `Ctrl+N` and `F2` are **blocked** while any text input, textarea, or contentEditable has focus.
- `Ctrl+N` and `F2` are **blocked** while a dialog/drawer is open (`[role="dialog"]` is in the DOM).
- `Ctrl/⌘+F` is **always active** in modules that have a search input. It prevents the browser's native Find dialog from opening.
- Barcode scanner (USB HID) behaves as keyboard input followed by `Enter`. The Enter→next-field navigation means scanner-driven workflows flow naturally without extra code.

### Hooks

- `useFormKeyboardNav({ ref, onSubmit, autoFocusDelay? })` — Enter/Shift+Enter/Ctrl+S + auto-focus on open
- `useModuleShortcuts({ onNew?, onEdit?, searchRef? })` — Ctrl+N / F2 / Ctrl+F at the page level

---

## Form Validation

- Required fields display a **red asterisk** `*` in the label, never just the placeholder.
- Error messages appear **inline below the field**, not in a toast.
- Errors are shown **on blur** (not on change) and on save attempt.
- The field border turns **red** when its error is visible.
- A summary error banner appears at the top of the form when save is attempted with validation failures.
- The Save button is **disabled** while the form has known errors after a save attempt.
- Friendly API error messages are surfaced in the banner, not raw server strings.

---

## Button Placement

- **Two-button footer**: Cancel (outline) on the left, Save/Create (primary) on the right.
- Primary action button is **always the rightmost** button.
- Destructive actions (Delete) use `variant="destructive"` and require a confirmation dialog.
- Loading state: `<Loader2 className="animate-spin" />` in the button, button disabled while pending.

---

## Status Colors

### Manufacturing Order Status

| Status | Classes |
|---|---|
| `draft` | `bg-gray-100 text-gray-700` |
| `released` | `bg-blue-100 text-blue-700` |
| `in_progress` | `bg-yellow-100 text-yellow-800` |
| `completed` | `bg-green-100 text-green-700` |
| `cancelled` | `bg-red-100 text-red-700` |

### Priority

| Priority | Classes |
|---|---|
| `low` | `bg-slate-100 text-slate-600` |
| `medium` | `bg-orange-100 text-orange-700` |
| `high` | `bg-red-100 text-red-700` |

### Entity Status (active/inactive)

Use `<MasterStatusBadge status={...} />` — green badge for active, muted for inactive.

### Dispatch Order Status

| Status | Classes |
|---|---|
| `draft` | `bg-gray-100 text-gray-600` |
| `confirmed` | `bg-blue-100 text-blue-700` |
| `loaded` | `bg-yellow-100 text-yellow-700` |
| `in_transit` | `bg-orange-100 text-orange-700` |
| `delivered` | `bg-green-100 text-green-700` |
| `cancelled` | `bg-red-100 text-red-600` |

---

## Loading Indicators

- Table/list loading: `<Skeleton className="h-10 w-full" />` rows (or `<Loader2 animate-spin />` centered in table body).
- Button loading: inline `<Loader2 className="h-4 w-4 mr-2 animate-spin" />` + button disabled.
- Full-page loading: `<Loader2 className="h-8 w-8 animate-spin mx-auto" />` centered in the content area.
- Never show a loading spinner and data at the same time.

---

## Success / Error Messages

- **Toasts** for brief confirmations: "Product created", "Dealer updated", "Order dispatched".
- **Inline banners** for form validation errors (save-attempt feedback in the drawer/dialog).
- Toast variant:
  - Success: default (no `variant` needed)
  - Failure: `variant: "destructive"`
- Toast title: short noun phrase ("Cell lot received", "Failed to save dealer").
- Toast description: only when context is needed (e.g. "Battery number auto-assigned").
- Never show a raw `500 Internal Server Error` string. Map server errors to friendly messages.

---

## Table Behavior

- All module tables support **click-to-select** rows (light blue highlight: `bg-blue-50 ring-1 ring-inset ring-blue-200`).
- Selected row is the target for `F2 → Edit`.
- Row hover: `hover:bg-muted/50`.
- Action buttons (Edit, Delete) are in the last column, right-aligned.
- Action button clicks call `e.stopPropagation()` so they don't also select the row.
- Empty state: centered muted text in the table body, no separate empty-state component.
- All tables are wrapped in `<div className="rounded-md border">` or `<Card>`.

---

## Drawer / Dialog Behavior

- **Create / Edit forms** use Radix `Sheet` (side drawer) for complex multi-field forms.
- **Quick dialogs** (confirmations, single-entity actions) use Radix `Dialog`.
- Sheet width: `w-[480px] sm:max-w-[480px] overflow-y-auto`.
- Dialog max width: `max-w-sm` (confirm) or `max-w-2xl` (form).
- On open: first field auto-focuses within 80ms (Sheet animation delay).
- On close via Esc or backdrop: form resets to empty/initial state.
- `SheetDescription` is always present (for accessibility).

---

## Audit Log Style

_(Reserved — to be defined when audit logs are surfaced in the UI.)_

---

## Module Header Pattern

```
<h1 className="text-2xl font-bold flex items-center gap-2">
  <ModuleIcon className="h-6 w-6 text-[accent-color]" />
  Module Name
</h1>
<p className="text-muted-foreground text-sm mt-1">Short description</p>
```

Primary accent colors by domain:
- Manufacturing: `text-orange-600`
- Cell operations: `text-teal-600`
- Logistics: `text-blue-600`
- Engineering Masters: default (`text-primary`)
- QC: `text-purple-600`

---

## Search Input Pattern

```tsx
const searchRef = useRef<HTMLInputElement>(null);
useModuleShortcuts({ searchRef, onNew: () => setOpen(true) });

<div className="relative flex-1 max-w-sm">
  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
  <Input
    ref={searchRef}
    type="search"
    placeholder="Search..."
    className="pl-8"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
  />
</div>
```

---

*Last updated: June 2026*
