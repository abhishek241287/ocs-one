import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Security events (audit log) ──────────────────────────────────────────────
// Permanent, append-only audit trail of security-relevant events: login
// success/failure, logout, account creation, authorization (403) denials, and
// rate-limit (429) hits. Powers the /developer/security engineering dashboard and
// satisfies MAT-06 audit-log verification (closes DEF-CW01-M06-003). Never store
// secrets, passwords, tokens, or full request bodies here — only metadata.

export const securityEventsTable = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stable machine event type, e.g. "auth.login.failed", "authz.denied".
    eventType: varchar("event_type", { length: 64 }).notNull(),
    // Triage severity: "info" | "warning" | "critical".
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    // Acting principal (null for anonymous / pre-auth events like failed login).
    actorId: uuid("actor_id"),
    actorEmail: varchar("actor_email", { length: 255 }),
    actorRole: varchar("actor_role", { length: 32 }),
    // Subject of the action when different from the actor (e.g. created user).
    targetEmail: varchar("target_email", { length: 255 }),
    // Request context.
    ip: varchar("ip", { length: 64 }),
    method: varchar("method", { length: 8 }),
    path: varchar("path", { length: 512 }),
    statusCode: integer("status_code"),
    // Short human-readable detail (never secrets / payloads).
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_security_events_created_at").on(table.createdAt),
    index("idx_security_events_type").on(table.eventType),
  ],
);

export const insertSecurityEventSchema = createInsertSchema(securityEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type SecurityEvent = typeof securityEventsTable.$inferSelect;
