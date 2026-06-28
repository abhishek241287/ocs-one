import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// The base database handle and the transaction handle passed to
// `db.transaction(async (tx) => …)`. `Executor` is either — so shared libraries
// (e.g. @workspace/ecf) can accept "the caller's tx OR the db" with full typing
// without importing drizzle's deep generic transaction types directly.
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export * from "./schema";
