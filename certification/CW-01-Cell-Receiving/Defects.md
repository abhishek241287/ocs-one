# CW-01 — Cell Receiving: Defect Log

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Log opened** | 2026-06-27 |
| **Log closed** | — |

---

## Defect Register

| ID | Title | Severity | Status | Found Date | Fixed Date | Fixed By | Notes |
|----|-------|----------|--------|------------|------------|----------|-------|
| DEF-CW01-001 | `useToast` used instead of `useOdsNotify` in CellReceivingPage | Medium | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | All `toast()` calls replaced with `notify.*()` |
| DEF-CW01-002 | `certification="certified"` shown on uncertified module | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | Prop removed; ModuleHeader now renders default "development" badge |
| DEF-CW01-003 | React Fragment missing `key` prop in `lots.map()` | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | `<>` replaced with `<Fragment key={lot.id}>` |
| DEF-CW01-004 | `@/components/ods/OdsNotify` import error — DealerMasterPage + DispatchOrdersPage | High | Verified | 2026-06-27 | pre-existing | Prior commit | Both files already use `@/hooks/use-ods-notify` — confirmed by grep; Vite errors absent from re-test console |
| DEF-CW01-005 | Sidebar stub routes `#qr`, `#warranty`, `#service` are non-functional | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | Items now render with `disabled: true`; show dimmed opacity + "soon" label; `cursor-not-allowed`; no navigation on click |

---

## Severity Key

| Severity | Definition | Certification Impact |
|----------|-----------|---------------------|
| **Critical** | Data loss, security breach, or complete workflow failure | 🚫 Blocks certification |
| **High** | Primary user journey cannot be completed | 🚫 Blocks certification |
| **Medium** | Usability or secondary workflow issue | ⚠️ Fix before closure (or explicit deferral) |
| **Low** | Cosmetic or minor enhancement | ✅ May defer to maintenance release |

## Status Key — Defect Lifecycle

| Status | Meaning |
|--------|---------|
| **Open** | Newly discovered |
| **Assigned** | Engineer is fixing it |
| **Fixed** | Code implemented |
| **Verified** | Re-tested successfully — defect no longer reproduces |
| **Deferred** | Approved for future release (Medium/Low only) |
| **Closed** | Certification wave completed; defect log archived |

---

## Defect Detail

### DEF-CW01-001 — `useToast` used instead of `useOdsNotify` in CellReceivingPage

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-001 |
| **Severity** | Medium |
| **Status** | ✅ Verified |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Fixed** | 2026-06-27 |
| **Fixed by** | Replit Agent |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |

**Fix applied:**
```diff
- import { useToast } from "@/hooks/use-toast";
+ import { useOdsNotify } from "@/hooks/use-ods-notify";

- const { toast } = useToast();
+ const notify = useOdsNotify();

- toast({ title: "Lot received", description: "Individual cell records generated." });
+ notify.success("Lot received", { description: "Individual cell records generated." });

- toast({ title: "Required fields missing", variant: "destructive" });
+ notify.error("Required fields missing");

- toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" });
+ notify.error("Error", { description: e?.message ?? "Failed" });
```

**Verification evidence:**
- TypeScript compile: zero errors (`tsc --noEmit` clean exit)
- Vite HMR: `CellReceivingPage.tsx` hot-updated without errors
- Browser console: no errors related to this file in MAT-01 re-test

---

### DEF-CW01-002 — `certification="certified"` shown on uncertified module

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-002 |
| **Severity** | Low |
| **Status** | ✅ Verified |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Fixed** | 2026-06-27 |
| **Fixed by** | Replit Agent |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |

**Fix applied:**
```diff
  <ModuleHeader
    icon="📦"
    title="Cell Receiving"
    description={`${meta?.total ?? 0} lots received`}
-   certification="certified"
    actions={...}
  />
```
`certification` prop removed. `ModuleHeader` defaults to `"development"` when no prop is passed.

**Verification evidence:**
- TypeScript compile: clean
- Vite HMR: clean hot-update
- Certification badge will now correctly reflect "development" state until CW-01 certification is granted

---

### DEF-CW01-003 — React Fragment missing `key` prop in `lots.map()`

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-003 |
| **Severity** | Low |
| **Status** | ✅ Verified |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Fixed** | 2026-06-27 |
| **Fixed by** | Replit Agent |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |

**Fix applied:**
```diff
+ import { useState, useRef, Fragment } from "react";

- lots.map((lot) => (
-   <>
-     <TableRow key={lot.id} ...>
-     {expandedLot === lot.id && <TableRow key={`${lot.id}-detail`} ...>}
-   </>
+ lots.map((lot) => (
+   <Fragment key={lot.id}>
+     <TableRow ...>
+     {expandedLot === lot.id && <TableRow ...>}
+   </Fragment>
))
```
Inner `TableRow` keys removed (key is now on the `Fragment` wrapper, which is the correct React pattern for multi-row list items).

**Verification evidence:**
- TypeScript compile: clean
- No React key warnings in browser console during MAT-01 re-test

---

### DEF-CW01-004 — `@/components/ods/OdsNotify` import error — DealerMasterPage + DispatchOrdersPage

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-004 |
| **Severity** | High |
| **Status** | ✅ Verified |
| **Found** | 2026-06-27 (MAT-01 session — browser console) |
| **Fixed** | Prior development commit (pre-existing fix) |
| **Fixed by** | Prior commit |
| **Files** | `artifacts/ocs-one/src/features/logistics/pages/DealerMasterPage.tsx` |
| | `artifacts/ocs-one/src/features/logistics/pages/DispatchOrdersPage.tsx` |

**Verification evidence:**

Grep confirmed both files already use the correct import path:
```
DealerMasterPage.tsx:17:  import { useOdsNotify } from "@/hooks/use-ods-notify";
DispatchOrdersPage.tsx:18: import { useOdsNotify } from "@/hooks/use-ods-notify";
```

MAT-01 re-test browser console (2026-06-27 post-fix session):
```
[vite] connecting...
[vite] connected.
[React DevTools hint]
Failed to load resource: 401  ← auth guard (expected)
Failed to load resource: 401  ← auth guard (expected)
[DOM] Input autocomplete hint  ← browser hint on login form (not an error)
```

**No `Failed to reload` errors present.** The High blocker is cleared.

Note: The Vite errors logged in the MAT-01 initial inspection were from a prior development session visible in HMR history. The files were corrected before the formal inspection was run and confirmed clean in the re-test.

---

### DEF-CW01-005 — Sidebar stub routes are non-functional

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-005 |
| **Severity** | Low |
| **Status** | ✅ Verified |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Fixed** | 2026-06-27 |
| **Fixed by** | Replit Agent |
| **File** | `artifacts/ocs-one/src/components/layout/Sidebar.tsx` |

**Fix applied:**

Updated `NavItem` type to support `disabled?: boolean`:
```diff
- type NavItem = { label: string; href: string; icon: any };
+ type NavItem = { label: string; href: string; icon: any; disabled?: boolean };
```

Marked stub items as disabled:
```diff
- { label: "QR Traceability", href: "#qr",      icon: QrCode },
- { label: "Warranty",        href: "#warranty", icon: FileCheck },
- { label: "Service",         href: "#service",  icon: Wrench },
+ { label: "QR Traceability", href: "#qr",      icon: QrCode,    disabled: true },
+ { label: "Warranty",        href: "#warranty", icon: FileCheck, disabled: true },
+ { label: "Service",         href: "#service",  icon: Wrench,    disabled: true },
```

Added disabled rendering branch — disabled items render as `<span>` (not `<Link>`), with `cursor-not-allowed`, `opacity-40`, and a `"soon"` micro-label:
```tsx
if (item.disabled) {
  return (
    <li key={item.label}>
      <span className="flex items-center gap-3 px-3 py-2 rounded-md cursor-not-allowed opacity-40 select-none">
        <Icon size={20} className="shrink-0" />
        {!collapsed && (
          <span className="truncate text-sm flex items-center gap-1.5">
            {item.label}
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-60">soon</span>
          </span>
        )}
      </span>
    </li>
  );
}
```

**Verification evidence:**
- TypeScript compile: clean
- Vite HMR: `Sidebar.tsx` hot-updated without errors
- Disabled items no longer navigate on click

---

## Summary

| Metric | Value |
|--------|-------|
| Total defects found | 5 |
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 3 |
| Fixed & verified | 5 |
| Deferred (with approval) | 0 |
| Open at MAT-01 re-test | 0 |

> **Certification gate:** Open Critical or High count must be **0** before certification is granted.
> Current status: **0 open blockers — gate cleared for MAT-01 PASS.**

## Deferred Defects (if any)

| ID | Title | Severity | Reason for Deferral | Approved By | Target Wave |
|----|-------|----------|---------------------|-------------|-------------|
