# OCS One — Refactoring Plan
**Date:** 2026-06-27  
**Goal:** Make V1.0 production-ready — fix blockers, clean dead code, close spec gaps

Items are ordered by priority. Do not mix feature work into these refactoring PRs.

---

## Priority 1 — Production Blockers (must ship before launch)

### R1: Add Authentication
**Effort:** Large (2–3 days)  
**Files:** `artifacts/api-server/src/app.ts`, `artifacts/ocs-one/src/App.tsx`, new middleware file

1. Pick auth provider (Replit Auth is already available in this environment via the `replit-auth` skill)
2. Add `requireAuth` middleware to `app.ts` before the `/api` router
3. Wrap all routes in `App.tsx` with a `<ProtectedRoute>` component that checks session state
4. Wire the `LoginPage.tsx` form to actually call `POST /api/auth/login`
5. Store session in an httpOnly cookie

### R2: Add Database Indexes
**Effort:** Small (2 hours)  
**Files:** `lib/db/src/schema/manufacturing.ts`, `lib/db/src/schema/cell-grading.ts`, `lib/db/src/schema/logistics.ts`

Apply all indexes listed in `performance_report.md § P1`. Use Drizzle's table extras syntax:

```ts
// In manufacturing.ts — example for mfgOrderStagesTable:
export const mfgOrderStagesTable = pgTable(
  "mfg_order_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id").notNull().references(...),
    stageType: mfgStagetypeEnum("stage_type").notNull(),
    // ... existing columns
  },
  (table) => [
    index("idx_mfg_stages_order_id").on(table.productionOrderId),
    index("idx_mfg_stages_order_type").on(table.productionOrderId, table.stageType),
    index("idx_mfg_stages_status").on(table.status),
  ]
);
```

Then run: `pnpm --filter @workspace/db run push`

### R3: Fix Battery/Order Number Race Condition
**Effort:** Small (2 hours)  
**Files:** `artifacts/api-server/src/routes/manufacturing/helpers.ts`, new DB migration

Replace the count-based sequential number generator with a Postgres sequence. Either add raw SQL migration or use Drizzle's `sql` escape hatch to create the sequence:

```ts
// helpers.ts
export async function generateOrderNumber(tx: Tx): Promise<string> {
  const [{ seq }] = await tx.execute(
    sql`SELECT nextval('mfg_order_seq') AS seq`
  );
  return `PO-${todayDateStr()}-${String(Number(seq)).padStart(4, "0")}`;
}
```

The sequence resets daily is optional — if you want `PO-20260627-0001` format with daily resets, a hybrid approach using `setval` at midnight works, but is complex. A simpler alternative is a globally incrementing sequence: `PO-00012345`. Choose before implementing.

### R4: Restrict CORS
**Effort:** Tiny (30 minutes)  
**Files:** `artifacts/api-server/src/app.ts`, environment secrets

```ts
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  credentials: true,
}));
```

Set `ALLOWED_ORIGINS` secret in Replit to the production domain.

### R5: Add Helmet.js and Rate Limiting
**Effort:** Small (1 hour)  
**Files:** `artifacts/api-server/src/app.ts`

```bash
pnpm --filter @workspace/api-server add helmet express-rate-limit
pnpm --filter @workspace/api-server add -D @types/express-rate-limit
```

```ts
import helmet from "helmet";
import rateLimit from "express-rate-limit";

app.use(helmet());
app.use("/api", rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true }));
```

---

## Priority 2 — Spec and Contract Cleanup (should ship with V1)

### R6: Update OpenAPI Spec for 14 Missing Routes
**Effort:** Medium (4–6 hours)  
**Files:** `lib/api-spec/openapi.yaml`

Add path entries for:
- All logistics routes (`/api/logistics/dealers`, `/api/logistics/dispatch-orders`, `/api/logistics/packing-dashboard`)
- Dashboard route (`/api/dashboard/director`)

Then run codegen: `pnpm --filter @workspace/api-spec run codegen`

Replace all raw-string query invalidations with the generated `get*QueryKey()` helpers.

### R7: Merge Duplicate Stage Sequence Definitions
**Effort:** Small (1 hour)  
**Files:** `artifacts/api-server/src/routes/manufacturing/helpers.ts`, `artifacts/api-server/src/routes/dashboard/director.ts`

Move `STAGE_META` (with display labels and icons) into `helpers.ts`. Import it in `director.ts`. This makes `helpers.ts` the single source of truth for stage definitions.

```ts
// helpers.ts — add:
export const STAGE_META: { type: StageTypeValue; label: string }[] = [
  { type: "cell_allocation", label: "Cell Allocation" },
  { type: "assembly",        label: "Assembly" },
  // ...
];
```

### R8: Standardize HTTP Verbs
**Effort:** Small (2 hours)  
**Files:** `artifacts/api-server/src/routes/logistics/dealers.ts`, `artifacts/api-server/src/routes/logistics/dispatch-orders.ts`, `lib/api-spec/openapi.yaml`

Change `router.put()` → `router.patch()` for update operations in logistics routes. Update the OpenAPI spec to match. Update any Orval-generated hook calls that currently call the PUT variant.

### R9: Validate UUID Path Params in Masters Router
**Effort:** Tiny (30 minutes)  
**Files:** `artifacts/api-server/src/routes/masters/common.ts`

```ts
import { z } from "zod/v4";
const idSchema = z.string().uuid();

// In Get, Update, Toggle handlers:
const id = idSchema.parse(req.params.id);
```

Wrap in try-catch to return 400 instead of 500 on invalid UUID format.

---

## Priority 3 — Code Quality (tech debt, pre-V2)

### R10: Delete Dead Code
**Effort:** Tiny (15 minutes)  
**Files to delete:**
- `artifacts/ocs-one/src/pages/DashboardPage.tsx` — replaced by `DirectorDashboardPage`, not imported anywhere

**Files to annotate (keep but mark):**
```ts
// artifacts/ocs-one/src/features/dispatch/index.ts
// TODO: Sprint N — Dispatch feature placeholder. Not yet implemented.
export * from "./types";
```

### R11: Split stages.ts (621 lines)
**Effort:** Medium (3 hours)  
**Files:** `artifacts/api-server/src/routes/manufacturing/stages.ts` → split into:
- `stages/read.ts` — GET all stages, GET single stage
- `stages/start.ts` — POST `:stage/start` + `onChargingStart` side-effect
- `stages/complete.ts` — POST `:stage/complete` + `onCellAllocationComplete`, `onBmsAllocationComplete`, etc.
- `stages/approve.ts` — POST `:stage/approve`, POST `:stage/reject`
- `stages/pause.ts` — POST `:stage/pause`, POST `:stage/resume`
- `stages/index.ts` — compose all routers, export

### R12: Split DirectorDashboardPage.tsx (544 lines)
**Effort:** Medium (2 hours)  
**Files:** `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx` → extract:
- `features/dashboard/components/KpiSection.tsx`
- `features/dashboard/components/PipelineSection.tsx`
- `features/dashboard/components/AlertsSection.tsx`
- `features/dashboard/components/OrdersSection.tsx`
- `features/dashboard/components/EquipmentSection.tsx`

### R13: Split TestingCard.tsx (520 lines) and ChargingCard.tsx (421 lines)
**Effort:** Medium (2 hours each)  
**Files:** Stage card components in `features/manufacturing/components/stage-cards/`

TestingCard → `StartTestingForm`, `TestResultsTable`, `TestSummaryBadge`  
ChargingCard → `ChargerSelector`, `ChargingProgressBar`, `ChargeSessionForm`

### R14: Add ESLint
**Effort:** Small (2 hours)  
**Files:** Root `package.json`, new `.eslintrc.json` or `eslint.config.mjs`

```bash
pnpm add -Dw eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react-hooks eslint-plugin-react-refresh
```

Add to root `package.json`:
```json
"scripts": {
  "lint": "eslint 'artifacts/*/src/**/*.{ts,tsx}' 'lib/*/src/**/*.ts'"
}
```

### R15: Add React Error Boundary
**Effort:** Tiny (1 hour)  
**Files:** `artifacts/ocs-one/src/App.tsx`, new `components/ErrorBoundary.tsx`

```tsx
// App.tsx
import { ErrorBoundary } from "@/components/ErrorBoundary";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary fallback={<AppCrashFallback />}>
        {/* existing JSX */}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
```

### R16: Configure QueryClient Global Defaults
**Effort:** Tiny (15 minutes)  
**Files:** `artifacts/ocs-one/src/App.tsx`

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});
```

### R17: Add overflow-x-auto to All Data Tables
**Effort:** Small (1 hour)  
**Files:** `CellMatchingPage.tsx`, `DispatchOrderDetailPage.tsx`, any other page with `<Table>`

```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

---

## Implementation Order

```
Week 1 (Pre-launch blockers):
  R1 (Auth) → R4 (CORS) → R5 (Helmet+RateLimit) → R2 (Indexes) → R3 (Sequence numbers)

Week 2 (Contract cleanup):
  R6 (OpenAPI) → R7 (Stage sequence) → R8 (HTTP verbs) → R9 (UUID validation)

Week 3 (Tech debt):
  R10 (Dead code) → R14 (ESLint) → R15 (Error boundary) → R16 (QueryClient) →
  R17 (Table scroll) → R11 (Split stages.ts) → R12 (Split dashboard) → R13 (Split cards)
```

---

## Files by Effort

| Effort | Items |
|---|---|
| Tiny (< 1 hr each) | R4, R10, R16, R17, R9 |
| Small (1–2 hrs each) | R2, R3, R5, R7, R8, R14, R15 |
| Medium (3–6 hrs each) | R1, R6, R11, R12, R13 |
