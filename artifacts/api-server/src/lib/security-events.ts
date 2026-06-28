import type { Request } from "express";
import { db, securityEventsTable, type InsertSecurityEvent } from "@workspace/db";
import { logger } from "./logger";

// ─── Security event recorder ──────────────────────────────────────────────────
// Fire-and-forget persistence of security-relevant events to the security_events
// audit table. Failures here must NEVER break the request being served, so all
// writes are best-effort and errors are logged, not thrown.

export type SecuritySeverity = "info" | "warning" | "critical";

export interface SecurityEventInput {
  eventType: string;
  severity?: SecuritySeverity;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetEmail?: string | null;
  ip?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  detail?: string | null;
}

/** Extract request metadata (ip/method/path) for an event without secrets. */
export function reqMeta(req: Request): Pick<SecurityEventInput, "ip" | "method" | "path"> {
  return {
    ip: req.ip ?? null,
    method: req.method ?? null,
    // Strip query string to avoid persisting any sensitive query params.
    path: (req.originalUrl ?? req.url ?? "").split("?")[0].slice(0, 512) || null,
  };
}

/**
 * Persist a security event. Best-effort: never awaited on the request hot path in
 * a way that can fail it. Returns the promise so callers may await in tests.
 */
export function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  const row: InsertSecurityEvent = {
    eventType: input.eventType,
    severity: input.severity ?? "info",
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole ?? null,
    targetEmail: input.targetEmail ?? null,
    ip: input.ip ?? null,
    method: input.method ?? null,
    path: input.path ?? null,
    statusCode: input.statusCode ?? null,
    detail: input.detail ? input.detail.slice(0, 1000) : null,
  };

  return db
    .insert(securityEventsTable)
    .values(row)
    .then(() => undefined)
    .catch((err: unknown) => {
      // Audit logging must not take down the request path; log and move on.
      logger.error({ err, eventType: input.eventType }, "Failed to record security event");
    });
}
