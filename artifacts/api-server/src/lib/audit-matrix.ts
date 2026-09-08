// ─── SS-03 — Audit Trail Matrix (single source of truth) ──────────────────────
// The audit-side complement to the SS-02 authorization matrix. Where SS-02 asks
// "can this principal perform this action?", SS-03 asks "was the action recorded
// correctly?". This matrix enumerates every critical operation that MUST leave an
// immutable audit record, the event type it must emit, the store it lands in, and
// which fields the persisted record must populate.
//
// It is the single source of truth shared by BOTH the SS-03 verification suite
// (cert/audit-suite.ts) AND the security dashboard, so the test and the dashboard
// can never drift — exactly as the SS-02 matrix is shared.
//
// Two audit stores exist in OCS One, and both are covered here:
//   - "security"  → security_events table (recordSecurityEvent): auth + authz +
//                   account-creation + rate-limit events. Append-only.
//   - "cell_lot"  → cell_lot_events table: the cell-receiving / grading domain
//                   timeline. Append-only, performed_by + changes(JSON) per row.

export type AuditStore = "security" | "cell_lot";

// Logical fields the CTO requires every audit record to carry. Each store maps
// these to concrete columns (see the extractor in the suite):
//   actor     → who did it           (security: actor_email|target_email · cell_lot: performed_by)
//   timestamp → when                 (security: created_at            · cell_lot: performed_at)
//   entityId  → subject of the event (security: target_email|path     · cell_lot: lot_id)
//   details   → structured context   (security: detail                · cell_lot: changes JSON)
export interface AuditFieldRequirements {
  actor: boolean;
  timestamp: boolean;
  entityId: boolean;
  details: boolean;
}

export interface AuditCheck {
  /** Stable id used by the suite to key its trigger logic. */
  id: string;
  /** Human-readable operation (the CTO's "Action" column). */
  action: string;
  /** Which audit store the record must land in. */
  store: AuditStore;
  /** Exact event_type the operation must emit. */
  expectedEventType: string;
  /** Which logical fields the persisted record must populate. */
  requires: AuditFieldRequirements;
}

const ALL: AuditFieldRequirements = {
  actor: true,
  timestamp: true,
  entityId: true,
  details: true,
};

export const AUDIT_MATRIX: AuditCheck[] = [
  // ─── Security events (security_events) ──────────────────────────────────────
  {
    id: "auth.login.success",
    action: "Successful login",
    store: "security",
    expectedEventType: "auth.login.success",
    // No JSON details column for this class; identity is captured in structured
    // actor_* columns and the request path, not a free-text detail.
    requires: { actor: true, timestamp: true, entityId: false, details: false },
  },
  {
    id: "auth.login.failed",
    action: "Failed login",
    store: "security",
    expectedEventType: "auth.login.failed",
    // Pre-auth: there is no authenticated actor; the attempted identity is the
    // target_email and the reason is in detail. entityId(target) + details required.
    requires: { actor: true, timestamp: true, entityId: true, details: true },
  },
  {
    id: "auth.logout",
    action: "Logout",
    store: "security",
    expectedEventType: "auth.logout",
    requires: { actor: true, timestamp: true, entityId: false, details: false },
  },
  {
    id: "user.created",
    action: "Account creation (director-only)",
    store: "security",
    expectedEventType: "user.created",
    requires: ALL, // actor(director) + target(new user) + detail(role) + ts
  },
  {
    id: "user.dealer_assignment_changed",
    action: "Change a dealer account's dealership assignment",
    store: "security",
    expectedEventType: "user.dealer_assignment_changed",
    requires: ALL,
  },
  {
    id: "authz.denied",
    action: "Unauthorized access (403)",
    store: "security",
    expectedEventType: "authz.denied",
    // Actor is the authenticated-but-forbidden principal; the path is the subject.
    requires: { actor: true, timestamp: true, entityId: true, details: false },
  },
  {
    id: "ratelimit.exceeded",
    action: "Rate limit hit (429)",
    store: "security",
    expectedEventType: "ratelimit.exceeded",
    // Actor may be anonymous (pre-auth flood); path is the subject.
    requires: { actor: false, timestamp: true, entityId: true, details: false },
  },

  // ─── Cell-receiving / grading domain events (cell_lot_events) ───────────────
  {
    id: "lot_received",
    action: "Create lot",
    store: "cell_lot",
    expectedEventType: "lot_received",
    requires: ALL,
  },
  {
    id: "lot_updated",
    action: "Edit lot",
    store: "cell_lot",
    expectedEventType: "lot_updated",
    requires: ALL,
  },
  {
    id: "cell_graded",
    action: "Grade a cell",
    store: "cell_lot",
    expectedEventType: "cell_graded",
    requires: ALL,
  },
  {
    id: "grading_started",
    action: "First grading (lot received → grading)",
    store: "cell_lot",
    expectedEventType: "grading_started",
    requires: ALL,
  },
  {
    id: "lot_fully_graded",
    action: "Last grading (lot grading → graded)",
    store: "cell_lot",
    expectedEventType: "lot_fully_graded",
    requires: ALL,
  },
  {
    // DEF-CW02-006: every controlled correction must be audited with its
    // mandatory reason, actor, entity, and before/after detail.
    id: "cell_grade_corrected",
    action: "Correct a graded cell (controlled re-grade)",
    store: "cell_lot",
    expectedEventType: "cell_grade_corrected",
    requires: ALL,
  },
];
