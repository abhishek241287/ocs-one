import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Performance snapshots ────────────────────────────────────────────────────
// Permanent historical store for certification performance runs (MAT-05 closure
// gate). Each row is one captured snapshot of the live `/developer/performance`
// state — the baseline comparison, bundle baseline, and server runtime at capture
// time — so trends, version comparisons, and regression/improvement over the last
// N runs can be computed from real recorded evidence rather than a single live
// snapshot.

export const performanceSnapshotsTable = pgTable(
  "performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Baseline contract version this run was measured against, e.g. "1.0".
    version: varchar("version", { length: 32 }).notNull(),
    // Human label, e.g. "MAT-05 closure run" or a free-form note.
    label: varchar("label", { length: 160 }).notNull(),
    // Number of operations flagged as regressed at capture time.
    regressionCount: integer("regression_count").notNull().default(0),
    // Full captured payload: baselineComparison[], bundle, server runtime, etc.
    metrics: jsonb("metrics").notNull(),
    note: text("note"),
    // Who triggered the capture (user id or email); null for automated captures.
    capturedBy: varchar("captured_by", { length: 160 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // History list is always `ORDER BY captured_at DESC LIMIT N`.
    index("idx_perf_snapshots_captured_at").on(table.capturedAt),
  ],
);

export const insertPerformanceSnapshotSchema = createInsertSchema(
  performanceSnapshotsTable,
).omit({ id: true, capturedAt: true });

export type InsertPerformanceSnapshot = z.infer<typeof insertPerformanceSnapshotSchema>;
export type PerformanceSnapshot = typeof performanceSnapshotsTable.$inferSelect;
