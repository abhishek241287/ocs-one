import { useQuery } from "@tanstack/react-query";

// Developer routes are intentionally OUTSIDE the OpenAPI spec, so this feature
// uses direct fetch rather than generated hooks (mirrors useSecurityDashboard).

export type ConfigStatus = "pass" | "warn" | "fail";
export type ConfigRuleKind =
  | "required"
  | "range"
  | "enum"
  | "unsafe-default"
  | "duplicate"
  | "conflict"
  | "integrity";

export interface ConfigCheck {
  id: string;
  group: string;
  label: string;
  kind: ConfigRuleKind;
  status: ConfigStatus;
  expected: string;
  actual: string;
  message: string;
}

export interface RateLimitPolicy {
  name: string;
  scope: string;
  windowMs: number;
  max: number;
  description: string;
}

export interface GradeConfig {
  gradeAMinCapacityPct: number;
  gradeAMaxIrMult: number;
  gradeBMinCapacityPct: number;
  gradeBMaxIrMult: number;
  gradeCMinCapacityPct: number;
  gradeCMaxIrMult: number;
  maxCapacityDiffAh: number;
  maxIrDiffMohm: number;
  maxVoltageDiffMv: number;
  nominalIrMohm: number;
  updatedAt: string;
}

export interface ConfigSnapshot {
  generatedAt: string;
  environment: {
    nodeEnv: string;
    isProduction: boolean;
    sessionSecretConfigured: boolean;
    databaseUrlConfigured: boolean;
    adminPasswordConfigured: boolean;
    adminUsingKnownDefault: boolean;
    trustProxy: number;
    allowedOriginsConfigured: boolean;
  };
  jwt: {
    algorithm: string;
    expiresIn: string;
    transport: string;
    cookieName: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    secretConfigured: boolean;
  };
  cookie: {
    name: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    maxAgeMs: number;
    path: string;
  };
  rateLimits: Record<string, RateLimitPolicy>;
  csp: {
    enabled: boolean;
    directives: Array<{ directive: string; values: string[]; unsafe: boolean }>;
    weakened: string[];
  };
  cors: { configured: boolean; origins: string[]; credentials: boolean; wildcard: boolean };
  featureFlags: { defined: string[]; count: number };
  manufacturing: {
    stages: Array<{ name: string; order: number }>;
    stageCount: number;
    balancing: { passMaxMv: number; warningMaxMv: number };
  };
  grading: GradeConfig | null;
  version: { apiServer: string; node: string; nodeEnv: string };
}

export interface ConfigValidation {
  generatedAt: string;
  summary: { total: number; passed: number; warnings: number; failed: number; drift: boolean };
  checks: ConfigCheck[];
}

export interface ConfigurationDashboard {
  generatedAt: string;
  snapshot: ConfigSnapshot;
  validation: ConfigValidation;
}

async function fetchConfigurationDashboard(): Promise<ConfigurationDashboard> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/developer/configuration`);
  if (!res.ok) {
    if (res.status === 403)
      throw new Error("Access denied — the configuration dashboard is director-only.");
    throw new Error("Failed to load configuration dashboard");
  }
  return res.json();
}

export function useConfigurationDashboard() {
  return useQuery({
    queryKey: ["developer-configuration"],
    queryFn: fetchConfigurationDashboard,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
