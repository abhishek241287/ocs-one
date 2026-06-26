---
name: Drizzle shared column constraint naming
description: Why spreading a shared Drizzle column object into multiple tables causes unique constraint name collisions, and the correct fix.
---

## The rule
Never spread a single shared Drizzle column object (defined once, shared by reference) across multiple `pgTable()` definitions when any column has `.unique()`. Each table must call a **factory function** that receives the table name and passes it as an explicit constraint name.

## Why
Drizzle computes unique constraint names from the column object at the point `.unique()` is called — before the column is bound to its table. A shared column object produces the same internal constraint name for every table that spreads it. When `drizzle-kit push` runs, it successfully creates the first table (e.g. `master_bms`) with its `code_unique` constraint, then fails with `relation "master_bms_code_unique" already exists` for every subsequent table.

## How to apply
```ts
// WRONG — shared object, all tables get the same constraint name
export const commonCols = {
  code: varchar("code", { length: 100 }).unique().notNull(),
};
export const tableA = pgTable("table_a", { ...commonCols });  // constraint: ???_code_unique
export const tableB = pgTable("table_b", { ...commonCols });  // COLLISION

// CORRECT — factory function with explicit constraint name per table
export const createCommonCols = (tableName: string) => ({
  code: varchar("code", { length: 100 }).unique(`${tableName}_code_unique`).notNull(),
});
export const tableA = pgTable("table_a", { ...createCommonCols("table_a") });
export const tableB = pgTable("table_b", { ...createCommonCols("table_b") });
```

Also: if the DB gets into a partially-pushed corrupt state from this bug, drop all affected tables and indexes via SQL before re-running push. `drizzle-kit push --force` does NOT recover from this — the underlying SQL error stops it.
