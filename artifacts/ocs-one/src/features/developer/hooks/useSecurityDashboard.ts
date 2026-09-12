import { keepPreviousData, useQuery } from "@tanstack/react-query";

// Developer routes are intentionally OUTSIDE the OpenAPI spec, so this feature
// uses direct fetch rather than generated hooks (mirrors usePerformanceMetrics).

export type AuthzOutcome = "pass" | "forbidden" | "unauthorized";
export type Principal = "director" | "supervisor" | "operator" | "viewer" | "anonymous";

export interface AuthzEndpoint {
  id: string;
  method: string;
  path: string;
  group: string;
  description: string;
  guard: string;
  expected: Record<Principal, AuthzOutcome>;
}

export interface SecurityEventRow {
  id: string;
  eventType: string;
  severity: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetEmail: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  detail: string | null;
  createdAt: string;
}

export interface DealerAssignmentSnapshot {
  id: string | null;
  code: string | null;
  name: string | null;
}

export interface DealerAssignmentChange {
  id: string;
  eventType: "user.dealer_assignment_changed";
  createdAt: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetEmail: string | null;
  previousDealership: DealerAssignmentSnapshot;
  newDealership: DealerAssignmentSnapshot;
}

export interface SecurityDashboardFilters {
  targetEmail?: string;
  from?: string;
  to?: string;
}

export interface RateLimitPolicy {
  name: string;
  scope: string;
  windowMs: number;
  max: number;
  description: string;
}

export interface SecurityDashboard {
  generatedAt: string;
  usersByRole: { counts: Record<string, number>; activeTotal: number };
  authorizationMatrix: {
    summary: { endpoints: number; principals: number; assertions: number; groups: string[] };
    principals: Principal[];
    groups: Record<string, AuthzEndpoint[]>;
  };
  failedLogins: { last24h: number; recent: SecurityEventRow[] };
  rateLimitEvents: { policies: Record<string, RateLimitPolicy>; recent: SecurityEventRow[] };
  accountCreations: SecurityEventRow[];
  permissionFailures: SecurityEventRow[];
  auditActivity: SecurityEventRow[];
  dealerAssignmentChanges: {
    last7d: number;
    filteredCount: number;
    recent: DealerAssignmentChange[];
    filters: { targetEmail: string | null; from: string | null; to: string | null };
  };
  eventCounts: Array<{ eventType: string; total: number }>;
  auditEventCounts: Array<{ id: string; action: string; eventType: string; total: number }>;
  securityScan: {
    recorded: boolean;
    generatedAt: string | null;
    sast: unknown;
    privacy: unknown;
  };
  dependencyAudit: { recorded: boolean; generatedAt: string | null; result: unknown };
  cspStatus: {
    enabled: boolean;
    directives: Array<{ directive: string; values: string[]; unsafe: boolean }>;
    weakened: string[];
  };
  jwtConfig: {
    algorithm: string;
    expiresIn: string;
    transport: string;
    cookieName: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    secretConfigured: boolean;
  };
  certificationStatus: { recorded: boolean; generatedAt: string | null; result: unknown };
}

async function fetchSecurityDashboard(filters: SecurityDashboardFilters): Promise<SecurityDashboard> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (filters.targetEmail) params.set("targetEmail", filters.targetEmail);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  const res = await fetch(`${base}/api/developer/security${query ? `?${query}` : ""}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("Access denied — the security dashboard is director-only.");
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to load security dashboard");
  }
  return res.json();
}

export function useSecurityDashboard(filters: SecurityDashboardFilters = {}) {
  return useQuery({
    queryKey: ["developer-security", filters],
    queryFn: () => fetchSecurityDashboard(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
