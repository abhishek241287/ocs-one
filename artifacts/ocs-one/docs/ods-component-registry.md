# ODS Component Registry — Version 1.0

> **Status: FROZEN — ODS Version 1.0**
> No new components are added to this registry without a formal design review.
> Future work moves to **Certification Wave 01 – Cell Receiving**.

---

## Index

| Component | Category | Status | Used By |
|-----------|----------|--------|---------|
| [ModuleHeader](#moduleheader) | Foundation | ✅ Certified | All pages |
| [OdsCertBadge](#odscertbadge) | Foundation | ✅ Certified | ModuleHeader, Architecture |
| [OdsStatusBadge](#odsstatusbadge) | Foundation | ✅ Certified | All list pages |
| [OdsEmptyState](#odsemptystate) | Foundation | ✅ Certified | All list/table pages |
| [OdsTableSkeleton](#odstableskeleton) | Foundation | ✅ Certified | All list/table pages |
| [OdsSearchBar](#odssearchbar) | Interaction | ✅ Certified | CellReceivingPage, CellGradingPage |
| [OdsToolbar](#odstoolbar) | Interaction | ✅ Certified | All list pages |
| [OdsDrawer](#odsdrawer) | Overlay | ✅ Certified | MasterPage, DealerMasterPage |
| [OdsDialog](#odsdialog) | Overlay | ✅ Certified | All confirm/delete flows |
| [OdsDataTable](#odsdatatable) | Data | ✅ Certified | All list pages |
| [OdsCommandPalette](#odscommandpalette) | Navigation | ✅ Certified | App-wide (Ctrl+K) |
| [OdsNotify / useOdsNotify](#odsnotify) | Feedback | ✅ Certified | All mutation flows |
| [OdsDevMode](#odsdevmode) | Developer | ✅ Certified | App-wide (Ctrl+Shift+D) |
| [OdsMetricCard](#odsmetriccard) | KPI | ✅ Certified | Director, Charging dashboards |
| [OdsMetricGrid](#odsmetricgrid) | KPI | ✅ Certified | Director, Charging dashboards |
| [OdsChartCard](#odschartcard) | Chart | ✅ Certified | Report pages, dashboards |
| [OdsTimeline](#odstimeline) | History | ✅ Certified | DispatchOrderDetailPage |
| [OdsStepper](#odsstepper) | Workflow | ✅ Certified | StageStepper, DispatchOrderDetailPage |
| [OdsPageLayout](#odspagelayout) | Layout | ✅ Certified | All new pages |

---

## ModuleHeader

**Purpose:** Standardised page header with icon, title, description, cert badge, and optional action slot.

**Import:** `import { ModuleHeader } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `icon` | `string` | ✓ | Emoji icon |
| `title` | `string` | ✓ | Page/module title |
| `description` | `string` | — | Subtitle text |
| `certification` | `CertLevel` | — | `"certified" \| "under-validation" \| "development"` |
| `actions` | `ReactNode` | — | Right-aligned action buttons |
| `badge` | `ReactNode` | — | Extra badge (e.g. record count) |

**Example:**
```tsx
<ModuleHeader
  icon="📦"
  title="Cell Receiving"
  description="Manage inbound cell lots"
  certification="certified"
  actions={<Button size="sm">+ Receive Lot</Button>}
/>
```

**Used By:** Every page in the app.

---

## OdsCertBadge

**Purpose:** Visual certification level pill. Shown in ModuleHeader and Architecture map.

**Import:** `import { OdsCertBadge, type CertLevel } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `level` | `CertLevel` | ✓ | `"certified" \| "under-validation" \| "development"` |

**Used By:** ModuleHeader, ArchitecturePage.

---

## OdsStatusBadge

**Purpose:** Status pill that maps string status values to colour-coded badges.

**Import:** `import { OdsStatusBadge, odsStatusColor } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `status` | `string` | ✓ | e.g. `"active"`, `"in_progress"`, `"rejected"` |
| `className` | `string` | — | Extra Tailwind classes |

**Known statuses:** active, inactive, completed, in_progress, pending, draft, released, approved, rejected, failed, cancelled, delivered, confirmed, loaded, in_transit, received, allocated, reserved, passed.

**Used By:** All list/table pages.

---

## OdsEmptyState

**Purpose:** Centered empty state with icon, title, description, and optional CTA.

**Import:** `import { OdsEmptyState } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `icon` | `string` | ✓ | Emoji |
| `title` | `string` | ✓ | Heading |
| `description` | `string` | — | Supporting text |
| `action` | `{ label: string; onClick: () => void }` | — | CTA button |

**Used By:** All list/table pages when no rows exist.

---

## OdsTableSkeleton

**Purpose:** Animated loading skeleton with configurable rows/columns.

**Import:** `import { OdsTableSkeleton } from "@/components/ods"`

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rows` | `number` | 5 | Skeleton row count |
| `columns` | `number` | 4 | Skeleton column count |

---

## OdsSearchBar

**Purpose:** Debounced search input with Ctrl+F capture mode.

**Import:** `import { OdsSearchBar } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `value` | `string` | ✓ | Controlled value |
| `onChange` | `(v: string) => void` | ✓ | Change handler |
| `placeholder` | `string` | — | Input placeholder |
| `captureCtrlF` | `boolean` | — | Intercept browser Ctrl+F to focus this input |
| `debounceMs` | `number` | 250 | Debounce delay |

---

## OdsToolbar

**Purpose:** Standardised page toolbar combining search, filters, refresh, and action buttons.

**Import:** `import { OdsToolbar } from "@/components/ods"`

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `search` | `{ value, onChange, placeholder }` | Embedded search bar |
| `filters` | `ReactNode` | Filter controls |
| `actions` | `ReactNode` | Right-aligned action buttons (e.g. "+ New") |
| `onRefresh` | `() => void` | Refresh button handler |
| `isRefreshing` | `boolean` | Spin the refresh icon |

---

## OdsDrawer

**Purpose:** Right-side slide-over panel for create/edit forms. Ctrl+S saves.

**Import:** `import { OdsDrawer } from "@/components/ods"`

**Key Props:**

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Show/hide |
| `onClose` | `() => void` | Close handler |
| `title` | `string` | Drawer title |
| `description` | `string` | Optional subtitle |
| `onSave` | `() => void` | Save handler (also bound to Ctrl+S) |
| `isSaving` | `boolean` | Disables save button |
| `size` | `"sm" \| "md" \| "lg" \| "xl"` | Width preset |
| `children` | `ReactNode` | Form content |

---

## OdsDialog

**Purpose:** Confirmation/action modal with danger / warning / confirm / default variants.

**Import:** `import { OdsDialog } from "@/components/ods"`

**Key Props:**

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Show/hide |
| `onClose` | `() => void` | Cancel handler |
| `onConfirm` | `() => void` | Confirm handler |
| `title` | `string` | Modal title |
| `description` | `string` | Body copy |
| `variant` | `"danger" \| "warning" \| "confirm" \| "default"` | Visual style |
| `confirmLabel` | `string` | Confirm button text |

---

## OdsDataTable

**Purpose:** Full-featured data table built on TanStack Table. Sorting, filtering, pagination, column visibility, density toggle.

**Import:** `import { OdsDataTable } from "@/components/ods"`

**Key Props:**

| Prop | Type | Description |
|------|------|-------------|
| `data` | `T[]` | Row data |
| `columns` | `ColumnDef<T>[]` | Column definitions |
| `isLoading` | `boolean` | Show skeleton |
| `emptyIcon` | `string` | Empty state icon |
| `emptyTitle` | `string` | Empty state heading |
| `enableSorting` | `boolean` | Column sort |
| `enableColumnVisibility` | `boolean` | Column toggle |
| `enableDensity` | `boolean` | Compact/comfortable toggle |
| `getRowId` | `(row: T) => string` | Row key |
| `onRowClick` | `(row: T) => void` | Row click handler |

---

## OdsCommandPalette

**Purpose:** Global Ctrl+K command palette. Search and navigate all modules, developer tools.

**Import:** `import { OdsCommandPalette } from "@/components/ods"`

**Usage:** Mount once at app root. Activates on Ctrl+K. Commands registered via `commands` prop array.

---

## OdsNotify

**Purpose:** Semantic notification API. Replaces all direct `useToast()` calls.

**Import:** `import { useOdsNotify } from "@/hooks/use-ods-notify"`

**API:**
```ts
const notify = useOdsNotify();
notify.success("Title", { description?: string, duration?: number });
notify.error("Title",   { description?: string });
notify.warning("Title", { description?: string });
notify.info("Title",    { description?: string });
```

**Rule:** No module should call `useToast()` directly. Always use `useOdsNotify()`.

---

## OdsDevMode

**Purpose:** Developer overlay (Ctrl+Shift+D). Shows page info, environment, shortcuts.

**Import:** `import { DevModeProvider, useDevMode } from "@/components/ods"`

**Usage:** Wrap app root in `<DevModeProvider>`. Use `useDevMode().setPageInfo(...)` in each page.

---

## OdsMetricCard

**Purpose:** KPI card for dashboards. Shows icon, title, value, unit, trend indicator, and footer.

**Import:** `import { OdsMetricCard } from "@/components/ods"`

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | ✓ | KPI label (ALL CAPS rendered automatically) |
| `value` | `string \| number` | ✓ | The primary metric value |
| `unit` | `string` | — | Unit suffix (e.g. "packs", "kWh") |
| `icon` | `ReactNode` | — | Lucide icon or emoji |
| `status` | `MetricStatus` | `"neutral"` | Colours the value: `positive \| negative \| warning \| neutral` |
| `trend` | `MetricTrend` | — | `"up" \| "down" \| "flat"` — shows TrendingUp/Down/Minus icon |
| `trendValue` | `string` | — | Trend annotation e.g. "+12% vs yesterday" |
| `footer` | `ReactNode` | — | Small text or node below the value |
| `onClick` | `() => void` | — | Makes card clickable with hover shadow |
| `isLoading` | `boolean` | `false` | Shows animated skeleton |

**Example:**
```tsx
<OdsMetricCard
  title="Completed Today"
  value={47}
  unit="packs"
  icon={<Factory className="h-4 w-4 text-green-600" />}
  status="positive"
  trend="up"
  trendValue="+12% vs yesterday"
  footer="batteries shipped"
/>
```

**Used By:** DirectorDashboardPage, ChargingDashboardPage.

---

## OdsMetricGrid

**Purpose:** Responsive grid wrapper for `OdsMetricCard` rows.

**Import:** `import { OdsMetricGrid } from "@/components/ods"`

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `2 \| 3 \| 4 \| "auto"` | `"auto"` | Grid column count. `"auto"` picks best fit. |
| `children` | `ReactNode` | ✓ | OdsMetricCard children |

**Used By:** DirectorDashboardPage, ChargingDashboardPage.

---

## OdsChartCard

**Purpose:** Standard card wrapper for any chart component (Recharts, custom divs, SVG).

**Import:** `import { OdsChartCard } from "@/components/ods"`

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | ✓ | Chart title |
| `subtitle` | `string` | — | Supporting text |
| `toolbar` | `ReactNode` | — | Extra controls in header (time range selector, etc.) |
| `onRefresh` | `() => void` | — | Refresh button |
| `onExport` | `() => void` | — | Export/download button |
| `isLoading` | `boolean` | `false` | Show animated skeleton bars |
| `isRefreshing` | `boolean` | `false` | Spin the refresh icon |
| `isEmpty` | `boolean` | `false` | Show empty state illustration |
| `emptyTitle` | `string` | `"No data available"` | Empty state heading |
| `emptyDescription` | `string` | — | Empty state body |
| `legend` | `ReactNode` | — | Legend rendered below chart area |
| `height` | `number \| string` | `240` | Chart body height |
| `children` | `ReactNode` | ✓ | The chart component |

**Used By:** Report pages, future dashboard chart sections.

---

## OdsTimeline

**Purpose:** Event log timeline for battery lifecycle, dispatch shipment events, QC audit trails, and activity logs.

**Import:** `import { OdsTimeline, type OdsTimelineItem } from "@/components/ods"`

**`OdsTimelineItem` shape:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique key |
| `title` | `string` | Event name |
| `description` | `string` | Optional detail |
| `timestamp` | `string \| Date` | When it occurred |
| `user` | `string` | Who performed it |
| `icon` | `ReactNode` | Emoji or Lucide icon |
| `status` | `string` | Status chip text |
| `color` | `TimelineColor` | `default \| success \| warning \| error \| info` |

**Component Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `OdsTimelineItem[]` | ✓ | Events array |
| `isLoading` | `boolean` | `false` | Show skeleton |
| `emptyTitle` | `string` | `"No events yet"` | — |
| `emptyDescription` | `string` | — | — |

**Used By:** DispatchOrderDetailPage (shipment events). Future: battery audit log, QC history, warranty events.

---

## OdsStepper

**Purpose:** Workflow progress indicator. Vertical for detail pages, horizontal for status bars.

**Import:** `import { OdsStepper, type OdsStep } from "@/components/ods"`

**`OdsStep` shape:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique key |
| `label` | `string` | Step name |
| `description` | `string` | Optional detail |
| `status` | `StepStatus` | `completed \| active \| pending \| locked \| rejected` |
| `timestamp` | `string \| Date` | Completion time |
| `user` | `string` | Who completed it |
| `icon` | `ReactNode` | Override dot icon |

**Component Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `steps` | `OdsStep[]` | ✓ | Steps array |
| `orientation` | `"vertical" \| "horizontal"` | `"vertical"` | Layout |
| `selectedId` | `string` | — | Highlights selected step with orange ring |
| `onStepClick` | `(id: string) => void` | — | Makes steps clickable |

**Status visuals:**
- `completed` → Green filled dot + green connector
- `active` → Primary filled dot + pulsing ring
- `pending` → Hollow dot + grey connector  
- `locked` → Grey filled dot (lock icon)
- `rejected` → Red filled dot (X icon)

**Used By:** StageStepper (manufacturing order detail), DispatchOrderDetailPage. Future: warranty, service, repair flows.

---

## OdsPageLayout

**Purpose:** Standard page shell. All new pages must use this instead of bare `AppLayout`.

**Import:** `import { OdsPageLayout } from "@/components/ods"`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `header` | `ReactNode` | ✓ | `<ModuleHeader .../>` |
| `toolbar` | `ReactNode` | — | `<OdsToolbar .../>` |
| `footer` | `ReactNode` | — | Sticky bottom bar |
| `noPadding` | `boolean` | — | Remove default `p-6` for full-bleed layouts |
| `children` | `ReactNode` | ✓ | Main content area |

**Standard page structure:**
```tsx
<OdsPageLayout
  header={<ModuleHeader icon="📦" title="Cell Receiving" certification="certified" />}
  toolbar={<OdsToolbar search={...} onRefresh={refetch} actions={<Button>+ Receive Lot</Button>} />}
>
  <OdsDataTable data={lots} columns={COLS} isLoading={isLoading} />
</OdsPageLayout>
```

**Used By:** All future pages (Certification Wave 01 onward).

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-06-27 | **FROZEN** — 19 components, all certified. Sprint: ODS Completion Pack. |
| 2.0 | 2026-06 (prev) | OdsDataTable, OdsToolbar, OdsDrawer, OdsDialog, OdsSearchBar, OdsCommandPalette, OdsNotify, OdsDevMode |
| 1.x | 2026-05 (prev) | Foundation: ModuleHeader, OdsCertBadge, OdsStatusBadge, OdsEmptyState, OdsTableSkeleton |

---

*This registry is the single source of truth for ODS component usage across OCS One.*
*Next milestone: Certification Wave 01 — Cell Receiving module.*
