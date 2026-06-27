# OCS One — Performance Report
**Date:** 2026-06-27  
**Scope:** API server query patterns, database indexes, React rendering, React Query cache

---

## Critical Findings

### P1 — No Database Indexes (CRITICAL)

**No explicit composite or secondary indexes exist anywhere in the schema.** Only primary keys (UUID) and `.unique()` constraints on code/number columns are indexed. Every query that filters, joins, or orders by a non-PK column does a full sequential table scan.

At development scale (hundreds of rows) this is invisible. At production scale (tens of thousands of orders, millions of timeline events) these queries will time out.

#### Missing indexes by table

**`mfg_production_orders`**
```sql
CREATE INDEX idx_mfg_orders_status ON mfg_production_orders(status);
CREATE INDEX idx_mfg_orders_current_stage ON mfg_production_orders(current_stage);
CREATE INDEX idx_mfg_orders_product_id ON mfg_production_orders(product_id);
CREATE INDEX idx_mfg_orders_created_at ON mfg_production_orders(created_at DESC);
-- For director dashboard status + stage combined filter:
CREATE INDEX idx_mfg_orders_status_stage ON mfg_production_orders(status, current_stage);
```

**`mfg_order_stages`** — queried on every stage card render
```sql
CREATE INDEX idx_mfg_stages_order_id ON mfg_order_stages(production_order_id);
CREATE INDEX idx_mfg_stages_stage_type ON mfg_order_stages(stage_type);
CREATE INDEX idx_mfg_stages_status ON mfg_order_stages(status);
-- Composite for the common pattern: stages for order X of type Y
CREATE INDEX idx_mfg_stages_order_type ON mfg_order_stages(production_order_id, stage_type);
```

**`mfg_battery_timeline`** — append-only event log, will grow fastest
```sql
CREATE INDEX idx_mfg_timeline_order_id ON mfg_battery_timeline(production_order_id);
CREATE INDEX idx_mfg_timeline_created_at ON mfg_battery_timeline(created_at DESC);
```

**`mfg_battery_genealogy`**
```sql
CREATE INDEX idx_mfg_genealogy_order_id ON mfg_battery_genealogy(production_order_id);
```

**`cells`** — filtered by status constantly
```sql
CREATE INDEX idx_cells_status ON cells(status);
CREATE INDEX idx_cells_lot_id ON cells(lot_id);
CREATE INDEX idx_cells_grade ON cells(grade);
-- Director dashboard cell inventory by status:
CREATE INDEX idx_cells_status_grade ON cells(status, grade);
```

**`cell_matches`**
```sql
CREATE INDEX idx_cell_matches_status ON cell_matches(status);
CREATE INDEX idx_cell_matches_created_at ON cell_matches(created_at DESC);
```

**`cell_match_items`**
```sql
CREATE INDEX idx_cell_match_items_match_id ON cell_match_items(match_id);
CREATE INDEX idx_cell_match_items_cell_id ON cell_match_items(cell_id);
```

**`logistics_dispatch_orders`**
```sql
CREATE INDEX idx_dispatch_orders_status ON logistics_dispatch_orders(status);
CREATE INDEX idx_dispatch_orders_dealer_id ON logistics_dispatch_orders(dealer_id);
```

**`logistics_dispatch_order_items`**
```sql
CREATE INDEX idx_dispatch_items_order_id ON logistics_dispatch_order_items(dispatch_order_id);
```

**`mfg_rework_tickets`**
```sql
CREATE INDEX idx_rework_order_id ON mfg_rework_tickets(production_order_id);
CREATE INDEX idx_rework_status ON mfg_rework_tickets(status);
```

**How to apply:** Add these to the Drizzle schema files using `.index()` within the table definition's `(table) => [...]` extra config, then run `pnpm --filter @workspace/db run push`.

---

### P2 — Race Condition in Order and Battery Number Generation

**Location:** `artifacts/api-server/src/routes/manufacturing/helpers.ts:19–40`

```ts
// CURRENT — not safe under concurrency
const [result] = await tx
  .select({ count: count() })
  .from(mfgProductionOrdersTable)
  .where(like(mfgProductionOrdersTable.orderNumber, `${prefix}%`));
const seq = ((result?.count as number) ?? 0) + 1;
return `${prefix}${String(seq).padStart(4, "0")}`;
```

Under concurrent requests (two operators creating orders simultaneously), both transactions read `count = 5` and both generate `PO-20260627-0006`. The unique constraint on `order_number` will cause one to fail with a `23505` constraint violation, returning an unhandled 500 error to the user.

**Fix:** Use a PostgreSQL sequence or an advisory lock:

```sql
-- Option A: Postgres sequence (recommended)
CREATE SEQUENCE mfg_order_number_seq;
CREATE SEQUENCE mfg_battery_number_seq;
```

```ts
// In helpers.ts:
const [{ seq }] = await tx.execute(
  sql`SELECT nextval('mfg_order_number_seq') as seq`
);
return `PO-${todayDateStr()}-${String(Number(seq)).padStart(4, "0")}`;
```

---

### P3 — Director Dashboard: 18 Parallel Queries on Every Request

**Location:** `artifacts/api-server/src/routes/dashboard/director.ts`

The `/api/dashboard/director` endpoint fires 18 queries in `Promise.all()` on every call. With auto-refresh every 30 seconds and the missing indexes noted above, this endpoint will be the first to saturate the connection pool.

**Recommendations:**
1. Apply the indexes above — reduces each query from full-scan to index range scan
2. Add server-side caching: `Cache-Control: max-age=15` header, or a 10-second in-memory LRU cache keyed by endpoint. The dashboard shows aggregate counts that are acceptable to be 10–15 seconds stale.
3. Consider a materialized view for the pipeline section counts, refreshed every minute by a `pg_cron` job.

---

### P4 — React Query: No Global staleTime

**Location:** `artifacts/ocs-one/src/App.tsx:33`

```ts
const queryClient = new QueryClient();  // all defaults
```

Default `staleTime` is `0`, meaning every query is immediately considered stale. Default `refetchOnWindowFocus` is `true`. Every time a user switches tabs and comes back, every mounted query on screen fires a network request. In a manufacturing operations context, operators frequently switch between browser tabs.

**Fix:**
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 seconds
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});
```

Individual queries that need live data (e.g. `useDirectorDashboard`) already use `refetchInterval: 30_000` explicitly, so they will still auto-refresh regardless of `staleTime`.

---

## Medium Findings

### P5 — No Pagination on Timeline and Genealogy Endpoints

`GET /manufacturing/orders/:id/timeline` and `GET /manufacturing/orders/:id/genealogy` return all rows without pagination. A battery with 50 stage transitions and many genealogy records returns everything in one payload. Add `limit`/`offset` query params with a default page size of 50.

### P6 — N+1 Risk in Stage Approve Handler

`stages.ts` calls `getStageOrFail()` (a DB query) both before and after the `db.transaction()` block on approve/reject handlers. This pattern is used correctly (first call validates, second call fetches updated row for response), but if more stages are added, this pattern will add 2 queries per handler. Consider using `.returning()` inside the transaction to avoid the post-transaction re-fetch.

### P7 — Count-Based Pagination on Large Master Tables

`masters/common.ts` uses `count()` + `select()` as two separate queries per list request. This is acceptable for master data (hundreds of rows). If any master table grows to tens of thousands of rows, replace with a single CTE query.

---

## React Rendering

- No `React.memo`, `useMemo`, or `useCallback` found anywhere. This is fine for the current component complexity — these optimizations are premature at this scale.
- No components identified as re-rendering unnecessarily. The `DirectorDashboardPage` could benefit from memoizing its section components since they render complex stat grids, but this is a minor concern.
- Missing `key` props on mapped elements would cause React reconciliation issues, but a quick scan shows `key` props are present on all list renders in the audited files.
