import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { logisticsDealersTable } from "./logistics";

// Six-role RBAC (Factory Ready v1.0). New values are APPENDED (not reordered) so a
// `drizzle-kit push` is a simple ALTER TYPE ... ADD VALUE — enum ordinal position is
// irrelevant because all authorization compares the role by string, never by order.
// owner  = unrestricted platform administrator (exactly one, the seed admin).
// dealer = external portal-only role with NO factory access (Dealer Portal v2 later).
export const userRoleEnum = pgEnum("user_role", [
  "director",
  "supervisor",
  "operator",
  "viewer",
  "owner",
  "dealer",
]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("operator"),
    dealerId: uuid("dealer_id").references(() => logisticsDealersTable.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_role").on(table.role),
  ]
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
