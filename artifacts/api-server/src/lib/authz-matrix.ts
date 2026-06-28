// ─── Authorization matrix — single source of truth (Security Standard SS-02) ───
// Every protected API endpoint with its expected outcome for each principal.
// This one definition drives BOTH the SS-02 automated authorization test suite
// (src/cert/authz-suite.ts) and the /developer/security dashboard matrix display,
// so what is tested is exactly what is documented. Derived by auditing the actual
// router guards (requireAuth / requireRole / requireWriteRole) in the codebase —
// not assumed. When a guard changes, update this matrix and SS-02 enforces it.

export type AuthzOutcome = "pass" | "forbidden" | "unauthorized";
export type Principal =
  | "director"
  | "supervisor"
  | "operator"
  | "viewer"
  | "anonymous";

export const PRINCIPALS: Principal[] = [
  "director",
  "supervisor",
  "operator",
  "viewer",
  "anonymous",
];

export interface AuthzEndpoint {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Concrete path (dummy ids) used for live SS-02 verification. */
  path: string;
  group: string;
  description: string;
  /** Human description of the enforcing guard. */
  guard: string;
  /** Body sent for write requests — intentionally invalid so handlers reject at
   * validation (the gate is what we test; no real rows are ever created). */
  body?: Record<string, unknown>;
  expected: Record<Principal, AuthzOutcome>;
}

// Dummy ids that resolve to 400/404 (never a real record) so an "allowed" write
// reaches the handler and is rejected at validation/lookup — proving the gate
// opened without mutating data.
export const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

// Outcome shorthands.
const P: AuthzOutcome = "pass";
const F: AuthzOutcome = "forbidden";
const U: AuthzOutcome = "unauthorized";

const all = (o: AuthzOutcome, anon: AuthzOutcome = U): Record<Principal, AuthzOutcome> => ({
  director: o,
  supervisor: o,
  operator: o,
  viewer: o,
  anonymous: anon,
});

const roles = (
  director: AuthzOutcome,
  supervisor: AuthzOutcome,
  operator: AuthzOutcome,
  viewer: AuthzOutcome,
  anonymous: AuthzOutcome = U,
): Record<Principal, AuthzOutcome> => ({
  director,
  supervisor,
  operator,
  viewer,
  anonymous,
});

export const AUTHZ_MATRIX: AuthzEndpoint[] = [
  // ─── Session / identity (requireAuth only) ──────────────────────────────────
  {
    id: "auth.me",
    method: "GET",
    path: "/api/auth/me",
    group: "Auth",
    description: "Current session identity",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "auth.register",
    method: "POST",
    path: "/api/auth/register",
    group: "Auth",
    description: "Create a user account",
    guard: "requireAuth + requireRole(director)",
    body: {},
    expected: roles(P, F, F, F),
  },

  // ─── Read-everywhere dashboards/lists (requireAuth only) ─────────────────────
  {
    id: "dashboard.director",
    method: "GET",
    path: "/api/dashboard/director",
    group: "Dashboard",
    description: "Director KPI dashboard",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "manufacturing.orders.list",
    method: "GET",
    path: "/api/manufacturing/orders",
    group: "Manufacturing",
    description: "List manufacturing orders",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "manufacturing.dashboard",
    method: "GET",
    path: "/api/manufacturing/dashboard",
    group: "Manufacturing",
    description: "Manufacturing dashboard",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "cells.inventory",
    method: "GET",
    path: "/api/cells/inventory",
    group: "Cells",
    description: "Cell inventory",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "cells.lots.list",
    method: "GET",
    path: "/api/cells/lots",
    group: "Cells",
    description: "List cell lots",
    guard: "requireAuth",
    expected: all(P),
  },
  {
    id: "logistics.packing",
    method: "GET",
    path: "/api/logistics/packing-dashboard",
    group: "Logistics",
    description: "Packing dashboard",
    guard: "requireAuth",
    expected: all(P),
  },

  // ─── Masters (requireWriteRole supervisor+director: read all, write sup+) ─────
  {
    id: "masters.products.list",
    method: "GET",
    path: "/api/masters/products",
    group: "Masters",
    description: "List product masters (read)",
    guard: "requireWriteRole(supervisor,director) — GET passes for all authed",
    expected: all(P),
  },
  {
    id: "masters.products.create",
    method: "POST",
    path: "/api/masters/products",
    group: "Masters",
    description: "Create product master (write)",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "masters.cells.create",
    method: "POST",
    path: "/api/masters/cells",
    group: "Masters",
    description: "Create cell master (write)",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },

  // ─── Manufacturing writes ────────────────────────────────────────────────────
  {
    id: "manufacturing.orders.create",
    method: "POST",
    path: "/api/manufacturing/orders",
    group: "Manufacturing",
    description: "Create manufacturing order",
    guard: "requireWriteRole(supervisor,director) per-route",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.orders.update",
    method: "PATCH",
    path: `/api/manufacturing/orders/${DUMMY_ID}`,
    group: "Manufacturing",
    description: "Update manufacturing order",
    guard: "requireWriteRole(supervisor,director) per-route",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.stage.start",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/stages/assembly/start`,
    group: "Manufacturing",
    description: "Start a production stage",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.stage.complete",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/stages/assembly/complete`,
    group: "Manufacturing",
    description: "Complete a production stage",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.stage.approve",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/stages/quality_control/approve`,
    group: "Manufacturing",
    description: "Approve a stage (sign-off)",
    guard: "requireWriteRole(supervisor,director) per-route",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.stage.reject",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/stages/quality_control/reject`,
    group: "Manufacturing",
    description: "Reject a stage (sign-off)",
    guard: "requireWriteRole(supervisor,director) per-route",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.stage.update",
    method: "PATCH",
    path: `/api/manufacturing/orders/${DUMMY_ID}/stages/assembly`,
    group: "Manufacturing",
    description: "Save stage notes/data (no transition)",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.genealogy.create",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/genealogy`,
    group: "Manufacturing",
    description: "Record genealogy",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.test-results.put",
    method: "PUT",
    path: `/api/manufacturing/orders/${DUMMY_ID}/test-results/capacity`,
    group: "Manufacturing",
    description: "Record test result",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.charger-units.create",
    method: "POST",
    path: "/api/manufacturing/charger-units",
    group: "Manufacturing",
    description: "Create charger unit",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.charger-units.update",
    method: "PATCH",
    path: `/api/manufacturing/charger-units/${DUMMY_ID}`,
    group: "Manufacturing",
    description: "Update charger unit",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.charger-units.status",
    method: "PATCH",
    path: `/api/manufacturing/charger-units/${DUMMY_ID}/status`,
    group: "Manufacturing",
    description: "Change charger unit status",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "manufacturing.rework.update",
    method: "PATCH",
    path: `/api/manufacturing/rework/${DUMMY_ID}`,
    group: "Manufacturing",
    description: "Update rework item",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "manufacturing.qc-approval.create",
    method: "POST",
    path: `/api/manufacturing/orders/${DUMMY_ID}/qc-approval`,
    group: "Manufacturing",
    description: "QC approval",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },

  // ─── Cells writes ────────────────────────────────────────────────────────────
  {
    id: "cells.config.read",
    method: "GET",
    path: "/api/cells/config",
    group: "Cells",
    description: "Read grade config",
    guard: "requireWriteRole(supervisor,director) — GET passes for all authed",
    expected: all(P),
  },
  {
    id: "cells.config.update",
    method: "PUT",
    path: "/api/cells/config",
    group: "Cells",
    description: "Update grade config",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "cells.matches.create",
    method: "POST",
    path: "/api/cells/matches",
    group: "Cells",
    description: "Generate cell match",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "cells.matches.get",
    method: "GET",
    path: `/api/cells/matches/${DUMMY_ID}`,
    group: "Cells",
    description: "Read a cell match detail",
    guard: "requireWriteRole(operator,supervisor,director) — GET passes for all authed",
    expected: all(P),
  },
  {
    id: "cells.matches.accept",
    method: "POST",
    path: `/api/cells/matches/${DUMMY_ID}/accept`,
    group: "Cells",
    description: "Accept (reserve) a cell match",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "cells.matches.regenerate",
    method: "POST",
    path: `/api/cells/matches/${DUMMY_ID}/regenerate`,
    group: "Cells",
    description: "Regenerate a draft cell match",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "cells.grade",
    method: "POST",
    path: `/api/cells/${DUMMY_ID}/grade`,
    group: "Cells",
    description: "Grade a cell",
    guard: "requireWriteRole(operator,supervisor,director)",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "cells.lots.create",
    method: "POST",
    path: "/api/cells/lots",
    group: "Cells",
    description: "Receive a cell lot",
    guard: "requireRole(operator,supervisor,director) per-route",
    body: {},
    expected: roles(P, P, P, F),
  },
  {
    id: "cells.lots.update",
    method: "PATCH",
    path: `/api/cells/lots/${DUMMY_ID}`,
    group: "Cells",
    description: "Correct a cell lot",
    guard: "requireRole(operator,supervisor,director) per-route",
    body: {},
    expected: roles(P, P, P, F),
  },

  // ─── Logistics writes (requireWriteRole supervisor+director) ──────────────────
  {
    id: "logistics.dealers.create",
    method: "POST",
    path: "/api/logistics/dealers",
    group: "Logistics",
    description: "Create dealer",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },
  {
    id: "logistics.dispatch.create",
    method: "POST",
    path: "/api/logistics/dispatch-orders",
    group: "Logistics",
    description: "Create dispatch order",
    guard: "requireWriteRole(supervisor,director)",
    body: {},
    expected: roles(P, P, F, F),
  },

  // ─── Reports (HARD requireRole(director,supervisor) on ALL methods) ───────────
  {
    id: "reports.executive",
    method: "GET",
    path: "/api/reports/executive",
    group: "Reports",
    description: "Executive report",
    guard: "requireRole(director,supervisor) — blocks operator/viewer reads too",
    expected: roles(P, P, F, F),
  },
  {
    id: "reports.production",
    method: "GET",
    path: "/api/reports/production",
    group: "Reports",
    description: "Production report",
    guard: "requireRole(director,supervisor)",
    expected: roles(P, P, F, F),
  },
  {
    id: "reports.cells",
    method: "GET",
    path: "/api/reports/cells",
    group: "Reports",
    description: "Cell receiving report",
    guard: "requireRole(director,supervisor) — router-level, blocks operator/viewer reads",
    expected: roles(P, P, F, F),
  },
  {
    id: "reports.quality",
    method: "GET",
    path: "/api/reports/quality",
    group: "Reports",
    description: "Quality report",
    guard: "requireRole(director,supervisor)",
    expected: roles(P, P, F, F),
  },
  {
    id: "reports.inventory",
    method: "GET",
    path: "/api/reports/inventory",
    group: "Reports",
    description: "Inventory report",
    guard: "requireRole(director,supervisor)",
    expected: roles(P, P, F, F),
  },
  {
    id: "reports.logistics",
    method: "GET",
    path: "/api/reports/logistics",
    group: "Reports",
    description: "Logistics report",
    guard: "requireRole(director,supervisor)",
    expected: roles(P, P, F, F),
  },

  // ─── Developer / engineering (director only) ─────────────────────────────────
  // NOTE: POST /api/developer/performance/snapshots is intentionally NOT fired
  // by SS-02. Its authorization gate is the SAME `requireRole("director")` applied
  // per-route on this router and already exercised by both GET endpoints below —
  // so the gate is covered. Firing the POST would create a real performance_snapshots
  // row for the director principal each run, violating the suite's "never mutate
  // real data" invariant (other endpoints use dummy ids that 404 before any write).
  {
    id: "developer.performance",
    method: "GET",
    path: "/api/developer/performance",
    group: "Developer",
    description: "Engineering health telemetry",
    guard: "requireRole(director)",
    expected: roles(P, F, F, F),
  },
  {
    id: "developer.performance.snapshots.list",
    method: "GET",
    path: "/api/developer/performance/snapshots",
    group: "Developer",
    description: "Performance snapshot history",
    guard: "requireRole(director)",
    expected: roles(P, F, F, F),
  },
  {
    id: "developer.security",
    method: "GET",
    path: "/api/developer/security",
    group: "Developer",
    description: "Security dashboard",
    guard: "requireRole(director)",
    expected: roles(P, F, F, F),
  },
];

/** Counts for quick reporting. */
export function matrixSummary() {
  return {
    endpoints: AUTHZ_MATRIX.length,
    principals: PRINCIPALS.length,
    assertions: AUTHZ_MATRIX.length * PRINCIPALS.length,
    groups: [...new Set(AUTHZ_MATRIX.map((e) => e.group))],
  };
}
