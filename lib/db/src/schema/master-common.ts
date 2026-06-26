import { pgEnum, uuid, varchar, text, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core";

export const masterStatusEnum = pgEnum("master_status", ["active", "inactive"]);

export interface Attachment {
  id: string;
  name: string;
  url: string;
  fileType: string;
  uploadedAt: string;
}

export const createMasterCommonColumns = (tableName: string) => ({
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 100 }).unique(`${tableName}_code_unique`).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: masterStatusEnum("status").notNull().default("active"),
  revisionNumber: integer("revision_number").notNull().default(1),
  effectiveDate: date("effective_date", { mode: "string" }),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
