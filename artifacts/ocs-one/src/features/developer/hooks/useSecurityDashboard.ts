import { useQuery } from "@tanstack/react-query";

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
  eventCounts: Array<{ eventType: string; total: number }>;
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

async function fetchSecurityDashboard(): Promise<SecurityDashboard> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/developer/security`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("Access denied — the security dashboard is director-only.");
    throw new Error("Failed to load security dashboard");
  }
  return res.json();
}

export function useSecurityDashboard() {
  return useQuery({
    queryKey: ["developer-security"],
    queryFn: fetchSecurityDashboard,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
