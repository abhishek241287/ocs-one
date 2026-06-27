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
| DEF-CW01-001 | `useToast` used instead of `useOdsNotify` in CellReceivingPage | Medium | Open | 2026-06-27 | — | — | ODS compliance violation |
| DEF-CW01-002 | `certification="certified"` shown on uncertified module | Low | Open | 2026-06-27 | — | — | Premature badge in ModuleHeader |
| DEF-CW01-003 | React Fragment missing `key` prop in `lots.map()` | Low | Open | 2026-06-27 | — | — | React reconciliation warning |
| DEF-CW01-004 | `@/components/ods/OdsNotify` import error — DealerMasterPage + DispatchOrdersPage | High | Open | 2026-06-27 | — | — | Found during CW-01 session; affects Logistics module |
| DEF-CW01-005 | Sidebar stub routes `#qr`, `#warranty`, `#service` are non-functional | Low | Open | 2026-06-27 | — | — | Traceability, Warranty, Service nav items lead nowhere |

---

## Severity Key

| Severity | Definition | Certification Impact |
|----------|-----------|---------------------|
| **Critical** | Data loss, security breach, or complete workflow failure | 🚫 Blocks certification |
| **High** | Primary user journey cannot be completed | 🚫 Blocks certification |
| **Medium** | Usability or secondary workflow issue | ⚠️ Fix before closure (or explicit deferral) |
| **Low** | Cosmetic or minor enhancement | ✅ May defer to maintenance release |

## Status Key

`Open` · `In Progress` · `Fixed` · `Verified` · `Deferred` · `Won't Fix`

---

## Defect Detail

### DEF-CW01-001 — `useToast` used instead of `useOdsNotify` in CellReceivingPage

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-001 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Found by** | Source code inspection |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |
| **Line** | 24 |

**Description:**
`CellReceivingPage.tsx` imports `useToast` from `@/hooks/use-toast` and uses it for success and error notifications. The project standard (as established in all newer modules) is `useOdsNotify` from `@/hooks/use-ods-notify`, which wraps the ODS notification system with consistent formatting, timing, and accessibility attributes.

**Evidence:**
```tsx
// Line 24 — CellReceivingPage.tsx
import { useToast } from "@/hooks/use-toast";
// ...
toast({ title: "Lot received", description: "Individual cell records generated." });
toast({ title: "Required fields missing", variant: "destructive" });
toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" });
```

**Expected:**
```tsx
import { useOdsNotify } from "@/hooks/use-ods-notify";
// ...
notify.success("Lot received", "Individual cell records generated.");
notify.error("Required fields missing");
notify.error("Error", e?.message ?? "Failed");
```

**Impact:** Notifications are visually inconsistent with other modules. ODS scoring fails for this page.

**Remediation:** Replace `useToast` import and all `toast(...)` calls with `useOdsNotify` equivalents in `CellReceivingPage.tsx`.

---

### DEF-CW01-002 — `certification="certified"` shown on uncertified module

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-002 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Found by** | Source code inspection |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |
| **Line** | 122 |

**Description:**
`ModuleHeader` is rendered with `certification="certified"`, which displays a "Certified" status badge on the Cell Receiving page. CW-01 has not been completed — the module is currently under acceptance testing. This creates a false impression of certification status visible to all users.

**Evidence:**
```tsx
<ModuleHeader
  icon="📦"
  title="Cell Receiving"
  description={`${meta?.total ?? 0} lots received`}
  certification="certified"   // ← incorrect
  ...
/>
```

**Impact:** Misleading UI. Any factory user who sees this page during testing will believe the module is production-certified when it is not.

**Remediation:** Set `certification="in-progress"` (or remove the prop entirely) until CW-01 certification is granted and `Certification.md` is signed off.

---

### DEF-CW01-003 — React Fragment missing `key` prop in `lots.map()`

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-003 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Found by** | Source code inspection |
| **File** | `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx` |
| **Lines** | 176–213 |

**Description:**
`lots.map((lot) => (<>...</>))` wraps each lot's two `TableRow` elements in a React Fragment (`<>...</>`). The fragment has no `key` prop, which violates the React rules for lists and will produce a `Warning: Each child in a list should have a unique "key" prop` warning in the development console.

**Evidence:**
```tsx
lots.map((lot) => (
  <>                                    // ← no key
    <TableRow key={lot.id} ...>
    {expandedLot === lot.id && (
      <TableRow key={`${lot.id}-detail`} ...>
    )}
  </>
))
```

**Expected:**
```tsx
lots.map((lot) => (
  <Fragment key={lot.id}>
    <TableRow ...>
    ...
  </Fragment>
))
```

**Impact:** React dev-mode warning; no functional impact in production but signals incorrect list rendering that could cause subtle reconciliation bugs under reordering.

**Remediation:** Replace `<>` with `<Fragment key={lot.id}>` (importing `Fragment` from `react`). The inner `TableRow` keys may then be removed if desired.

---

### DEF-CW01-004 — `@/components/ods/OdsNotify` import error in Logistics pages

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-004 |
| **Severity** | High |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-01 session — found during navigation) |
| **Found by** | Vite workflow log + browser console |
| **Primary module** | Logistics (CW-06) — found during CW-01 session |
| **Files** | `artifacts/ocs-one/src/features/logistics/pages/DealerMasterPage.tsx` (line 26) |
| | `artifacts/ocs-one/src/features/logistics/pages/DispatchOrdersPage.tsx` (line 26) |

**Description:**
Both `DealerMasterPage.tsx` and `DispatchOrdersPage.tsx` import `useOdsNotify` from `@/components/ods/OdsNotify` — a path that does not exist. The correct path is `@/hooks/use-ods-notify`. Vite fails to resolve the import, causing both pages to fail to load entirely.

**Evidence — Vite server log:**
```
3:49:44 PM [vite] Internal server error: Failed to resolve import
  "@/components/ods/OdsNotify" from
  "src/features/logistics/pages/DispatchOrdersPage.tsx"
  Plugin: vite:import-analysis
  File: ...DispatchOrdersPage.tsx:18:29
  26 | import { useOdsNotify } from "@/components/ods/OdsNotify";

3:50:57 PM [vite] Pre-transform error: Failed to resolve import
  "@/components/ods/OdsNotify" from
  "src/features/logistics/pages/DealerMasterPage.tsx"
  Plugin: vite:import-analysis
  File: ...DealerMasterPage.tsx:17:29
  26 | import { useOdsNotify } from "@/components/ods/OdsNotify";
```

**Evidence — browser console:**
```
[vite] Failed to reload /src/features/logistics/pages/DealerMasterPage.tsx.
[vite] Failed to reload /src/features/logistics/pages/DispatchOrdersPage.tsx.
```

**Impact:** Navigating to Dispatch Orders or Dealer Master renders a broken page or blank screen. These are core Logistics workflows. Classified High because the primary user journey (dispatch an order, manage a dealer) cannot be completed.

**Remediation:** In both files, change:
```tsx
import { useOdsNotify } from "@/components/ods/OdsNotify";
```
to:
```tsx
import { useOdsNotify } from "@/hooks/use-ods-notify";
```

Note: This defect belongs to the Logistics module (CW-06 scope). It is logged here because it was discovered and is observable during CW-01 testing. The fix should be applied before CW-06 begins, or as an immediate patch to unblock operator navigation.

---

### DEF-CW01-005 — Sidebar stub routes are non-functional

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-005 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-01 inspection) |
| **Found by** | Source code inspection |
| **File** | `artifacts/ocs-one/src/components/layout/Sidebar.tsx` |
| **Lines** | 97–107 |

**Description:**
Three sidebar navigation items use anchor-style stub hrefs (`#qr`, `#warranty`, `#service`) rather than real routes:
- **Traceability → QR Traceability** (`href="#qr"`)
- **After-Sales → Warranty** (`href="#warranty"`)
- **After-Sales → Service** (`href="#service"`)

Clicking these items does not navigate to any page. They appear as real navigation options but silently fail.

**Evidence:**
```tsx
{ label: "QR Traceability", href: "#qr",      icon: QrCode },
{ label: "Warranty",        href: "#warranty", icon: FileCheck },
{ label: "Service",         href: "#service",  icon: Wrench },
```

**Impact:** Operator or director clicking these items sees no response. No error message, no loading state. Misleading for new users.

**Remediation options (choose one before CW-01 certification):**
1. Remove the stub items until the pages are built.
2. Replace `href="#..."` with the real route when the page is implemented.
3. Add a `disabled` visual state and tooltip ("Coming soon") so the intent is clear without false navigation.

---

## Summary

| Metric | Value |
|--------|-------|
| Total defects found | 5 |
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 3 |
| Fixed & verified | 0 |
| Deferred (with approval) | 0 |
| Open at wave close | 5 |

> **Certification gate:** Open Critical or High count must be **0** before certification is granted.
> Current blocking defects: **1** (DEF-CW01-004 — High).

## Deferred Defects (if any)

| ID | Title | Severity | Reason for Deferral | Approved By | Target Wave |
|----|-------|----------|---------------------|-------------|-------------|
