// ─── SS-04 — Configuration Integrity (single source of truth) ─────────────────
// The configuration-side complement to SS-02 (authorization) and SS-03 (audit).
//   SS-02 asks: "can this principal perform this action?"
//   SS-03 asks: "was the action recorded?"
//   SS-04 asks: "is every production configuration correct and consistent?"
//
// Configuration drift is a production defect. This module is the single source of
// truth shared by BOTH the SS-04 verification suite (cert/config-suite.ts) AND
// the /developer/configuration dashboard, so the test and the dashboard can never
// drift — exactly as the SS-02 / SS-03 matrices are shared.
//
// gatherConfig() builds a JSON-safe SNAPSHOT of every config that affects
// security or manufacturing behaviour (never exposing secret VALUES — only
// whether a secret is configured). validateConfig() runs the integrity RULES:
//   required exists · within range · no unsafe default · no duplicate · no conflict.

import type { InferSelectModel } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, cellGradeConfigTable } from "@workspace/db";
import {
  RATE_LIMITS,
  COOKIE_NAME,
  COOKIE_OPTIONS,
  TRUST_PROXY,
  describeCspStatus,
  describeJwtConfig,
} from "./security-config";
import { DEFAULT_ADMIN_PASSWORD } from "./seed";
import { AUTHZ_MATRIX, PRINCIPALS } from "./authz-matrix";
import {
  BALANCING_THRESHOLDS,
  EXPECTED_STAGE_SEQUENCE,
  describeManufacturingConfig,
} from "./manufacturing-config";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type GradeConfig = InferSelectModel<typeof cellGradeConfigTable>;

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
  jwt: ReturnType<typeof describeJwtConfig>;
  cookie: {
    name: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    maxAgeMs: number;
    path: string;
  };
  rateLimits: typeof RATE_LIMITS;
  csp: ReturnType<typeof describeCspStatus>;
  cors: {
    configured: boolean;
    origins: string[];
    credentials: boolean;
    wildcard: boolean;
  };
  featureFlags: { defined: string[]; count: number };
  manufacturing: ReturnType<typeof describeManufacturingConfig>;
  grading: GradeConfig | null;
  version: { apiServer: string; node: string; nodeEnv: string };
}

export interface ConfigValidation {
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    drift: boolean;
  };
  checks: ConfigCheck[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a JWT duration string ("8h", "30m", "7d") to milliseconds. */
function parseDurationMs(s: string): number | null {
  const m = /^(\d+)\s*([smhd])$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

async function readApiVersion(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const raw = await fs.readFile(path.join(dir, "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === "@workspace/api-server") return pkg.version ?? "unknown";
    } catch {
      /* keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export async function gatherConfig(): Promise<ConfigSnapshot> {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Value-aware: the known seed default is "in use" when no override is set OR
  // when the override has been set to the very same default. The password VALUE
  // is never stored in or exposed by the snapshot — only this boolean.
  const adminPw = process.env.ADMIN_PASSWORD;
  const adminPasswordConfigured = Boolean(adminPw);
  const adminUsingKnownDefault = !adminPw || adminPw === DEFAULT_ADMIN_PASSWORD;

  const [grading] = await db
    .select()
    .from(cellGradeConfigTable)
    .where(eq(cellGradeConfigTable.id, 1))
    .limit(1);

  const apiServer = await readApiVersion();

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeEnv,
      isProduction,
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      adminPasswordConfigured,
      adminUsingKnownDefault,
      trustProxy: TRUST_PROXY,
      allowedOriginsConfigured: allowedOrigins.length > 0,
    },
    jwt: describeJwtConfig(),
    cookie: {
      name: COOKIE_NAME,
      httpOnly: COOKIE_OPTIONS.httpOnly,
      sameSite: COOKIE_OPTIONS.sameSite,
      secure: COOKIE_OPTIONS.secure,
      maxAgeMs: COOKIE_OPTIONS.maxAge,
      path: COOKIE_OPTIONS.path,
    },
    rateLimits: RATE_LIMITS,
    csp: describeCspStatus(),
    cors: {
      configured: allowedOrigins.length > 0,
      origins: allowedOrigins,
      credentials: true,
      wildcard: allowedOrigins.includes("*"),
    },
    featureFlags: { defined: [], count: 0 },
    manufacturing: describeManufacturingConfig(),
    grading: grading ?? null,
    version: { apiServer, node: process.versions.node, nodeEnv },
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateConfig(snap: ConfigSnapshot): ConfigValidation {
  const checks: ConfigCheck[] = [];
  const isProd = snap.environment.isProduction;

  const add = (
    id: string,
    group: string,
    label: string,
    kind: ConfigRuleKind,
    status: ConfigStatus,
    expected: string,
    actual: string,
    message: string,
  ) => checks.push({ id, group, label, kind, status, expected, actual, message });

  // ── Required environment ────────────────────────────────────────────────────
  add(
    "env.session_secret",
    "Environment",
    "SESSION_SECRET configured",
    "required",
    snap.environment.sessionSecretConfigured ? "pass" : "fail",
    "set",
    snap.environment.sessionSecretConfigured ? "set" : "missing",
    snap.environment.sessionSecretConfigured
      ? "JWT signing secret is present."
      : "JWT signing secret is missing — auth cannot operate securely.",
  );
  add(
    "env.database_url",
    "Environment",
    "DATABASE_URL configured",
    "required",
    snap.environment.databaseUrlConfigured ? "pass" : "fail",
    "set",
    snap.environment.databaseUrlConfigured ? "set" : "missing",
    snap.environment.databaseUrlConfigured
      ? "Database connection string is present."
      : "Database connection string is missing.",
  );
  add(
    "env.admin_password",
    "Environment",
    "No default admin credentials in use",
    "unsafe-default",
    !snap.environment.adminUsingKnownDefault ? "pass" : isProd ? "fail" : "warn",
    "non-default password",
    snap.environment.adminUsingKnownDefault ? "known default in use" : "custom password set",
    !snap.environment.adminUsingKnownDefault
      ? "Admin password is a non-default, explicitly configured value."
      : isProd
        ? "The known seed default admin password is in use in production — unsafe default."
        : "The known seed default admin password is in use (dev only) — must be changed before production.",
  );
  add(
    "env.trust_proxy",
    "Environment",
    "Trust-proxy hop count correct",
    "integrity",
    snap.environment.trustProxy === 1 ? "pass" : "fail",
    "1",
    String(snap.environment.trustProxy),
    snap.environment.trustProxy === 1
      ? "Express trusts exactly one proxy hop (the Replit edge) — client-IP attribution and rate limiting are correct."
      : "trust proxy must be 1 behind the Replit proxy, or client IPs (and rate limiting) are computed incorrectly.",
  );

  // ── JWT / session ────────────────────────────────────────────────────────────
  add(
    "jwt.algorithm",
    "JWT / Session",
    "Signing algorithm",
    "enum",
    snap.jwt.algorithm === "HS256" ? "pass" : "fail",
    "HS256",
    snap.jwt.algorithm,
    snap.jwt.algorithm === "HS256"
      ? "Expected HMAC-SHA256 signing algorithm."
      : `Unexpected JWT algorithm "${snap.jwt.algorithm}".`,
  );
  const expiresMs = parseDurationMs(snap.jwt.expiresIn);
  const MAX_TTL = 24 * 3_600_000;
  add(
    "jwt.expiry",
    "JWT / Session",
    "Token TTL within range",
    "range",
    expiresMs != null && expiresMs > 0 && expiresMs <= MAX_TTL ? "pass" : "fail",
    "0 < ttl ≤ 24h",
    snap.jwt.expiresIn,
    expiresMs == null
      ? `Unparseable JWT TTL "${snap.jwt.expiresIn}".`
      : expiresMs <= 0 || expiresMs > MAX_TTL
        ? "JWT TTL is outside the safe 0–24h range."
        : "JWT token lifetime is within the safe range.",
  );
  add(
    "cookie.httponly",
    "JWT / Session",
    "Cookie httpOnly",
    "unsafe-default",
    snap.cookie.httpOnly ? "pass" : "fail",
    "true",
    String(snap.cookie.httpOnly),
    snap.cookie.httpOnly
      ? "Session cookie is httpOnly (not readable by JS)."
      : "Session cookie is NOT httpOnly — exposed to XSS token theft.",
  );
  add(
    "cookie.samesite",
    "JWT / Session",
    "Cookie sameSite",
    "enum",
    snap.cookie.sameSite === "lax" || snap.cookie.sameSite === "strict" ? "pass" : "fail",
    "lax | strict",
    snap.cookie.sameSite,
    snap.cookie.sameSite === "lax" || snap.cookie.sameSite === "strict"
      ? "Cookie sameSite mitigates CSRF."
      : `Unsafe sameSite value "${snap.cookie.sameSite}".`,
  );
  add(
    "cookie.secure",
    "JWT / Session",
    "Cookie secure flag",
    "unsafe-default",
    snap.cookie.secure ? "pass" : isProd ? "fail" : "warn",
    isProd ? "true" : "true in production",
    String(snap.cookie.secure),
    snap.cookie.secure
      ? "Cookie is sent over HTTPS only."
      : isProd
        ? "Cookie secure flag is OFF in production — token can leak over HTTP."
        : "Cookie secure flag is OFF (dev only) — auto-enables in production.",
  );
  // Conflict: cookie maxAge must equal the JWT TTL (drift between the two = bug).
  const ttlMatches = expiresMs != null && snap.cookie.maxAgeMs === expiresMs;
  add(
    "cookie.maxage_matches_jwt",
    "JWT / Session",
    "Cookie maxAge matches JWT TTL",
    "conflict",
    ttlMatches ? "pass" : "fail",
    expiresMs != null ? `${expiresMs} ms` : "n/a",
    `${snap.cookie.maxAgeMs} ms`,
    ttlMatches
      ? "Cookie lifetime is consistent with the JWT lifetime."
      : "Cookie maxAge and JWT TTL disagree — session expiry is inconsistent.",
  );

  // ── Rate limits ──────────────────────────────────────────────────────────────
  const policies = Object.values(snap.rateLimits);
  for (const p of policies) {
    add(
      `ratelimit.${p.name}.bounds`,
      "Rate Limits",
      `Policy "${p.name}" bounds`,
      "range",
      p.max > 0 && p.windowMs > 0 ? "pass" : "fail",
      "max > 0, window > 0",
      `${p.max} / ${Math.round(p.windowMs / 1000)}s`,
      p.max > 0 && p.windowMs > 0
        ? `${p.max} requests per ${Math.round(p.windowMs / 1000)}s.`
        : `Policy "${p.name}" has a non-positive limit or window.`,
    );
  }
  add(
    "ratelimit.auth.tight",
    "Rate Limits",
    "Auth limiter is tight",
    "range",
    snap.rateLimits.auth.max <= 50 ? "pass" : "warn",
    "≤ 50 / window",
    `${snap.rateLimits.auth.max}`,
    snap.rateLimits.auth.max <= 50
      ? "Login limiter is tight enough for brute-force protection."
      : "Login limiter is unusually permissive — review brute-force exposure.",
  );
  const scopes = policies.map((p) => p.scope);
  const dupScopes = scopes.filter((s, i) => scopes.indexOf(s) !== i);
  add(
    "ratelimit.no_dup_scopes",
    "Rate Limits",
    "No duplicate limiter scopes",
    "duplicate",
    dupScopes.length === 0 ? "pass" : "fail",
    "unique scopes",
    dupScopes.length === 0 ? "unique" : dupScopes.join(", "),
    dupScopes.length === 0
      ? "Each rate-limit policy targets a distinct scope."
      : `Duplicate rate-limit scope(s): ${dupScopes.join(", ")}.`,
  );

  // ── CORS ─────────────────────────────────────────────────────────────────────
  add(
    "cors.no_wildcard_with_credentials",
    "CORS",
    "No wildcard origin with credentials",
    "conflict",
    snap.cors.wildcard ? "fail" : "pass",
    "explicit origins",
    snap.cors.wildcard ? "* + credentials" : snap.cors.origins.join(", ") || "(none)",
    snap.cors.wildcard
      ? "Wildcard origin combined with credentials is unsafe and rejected by browsers."
      : "CORS uses explicit origins (or is disabled) — compatible with credentials.",
  );
  add(
    "cors.configured_in_prod",
    "CORS",
    "Allowed origins set in production",
    "unsafe-default",
    snap.cors.configured ? "pass" : isProd ? "warn" : "pass",
    isProd ? "≥ 1 origin" : "optional in dev",
    snap.cors.origins.join(", ") || "(none)",
    snap.cors.configured
      ? `${snap.cors.origins.length} allowed origin(s) configured.`
      : isProd
        ? "No ALLOWED_ORIGINS in production — cross-origin clients are blocked."
        : "No ALLOWED_ORIGINS (dev) — CORS disabled, same-origin only.",
  );

  // ── CSP ──────────────────────────────────────────────────────────────────────
  add(
    "csp.enabled",
    "Content-Security-Policy",
    "CSP enforced",
    "required",
    snap.csp.enabled ? "pass" : "fail",
    "enabled",
    snap.csp.enabled ? "enabled" : "disabled",
    snap.csp.enabled ? "Content-Security-Policy is enforced." : "CSP is not enforced.",
  );
  add(
    "csp.no_unsafe",
    "Content-Security-Policy",
    "No weakened directives",
    "unsafe-default",
    snap.csp.weakened.length === 0 ? "pass" : "warn",
    "no 'unsafe-*'",
    snap.csp.weakened.join(", ") || "none",
    snap.csp.weakened.length === 0
      ? "No directives carry 'unsafe' values."
      : `Weakened directive(s): ${snap.csp.weakened.join(", ")} (required for Vite dev inline).`,
  );

  // ── RBAC matrix integrity ───────────────────────────────────────────────────
  add(
    "rbac.matrix_present",
    "RBAC Matrix",
    "Authorization matrix populated",
    "required",
    AUTHZ_MATRIX.length > 0 ? "pass" : "fail",
    "≥ 1 endpoint",
    `${AUTHZ_MATRIX.length} endpoints`,
    AUTHZ_MATRIX.length > 0
      ? `${AUTHZ_MATRIX.length} protected endpoints enforced (SS-02).`
      : "Authorization matrix is empty.",
  );
  const ids = AUTHZ_MATRIX.map((e) => e.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  add(
    "rbac.no_dup_endpoints",
    "RBAC Matrix",
    "No duplicate endpoint definitions",
    "duplicate",
    dupIds.length === 0 ? "pass" : "fail",
    "unique ids",
    dupIds.length === 0 ? "unique" : dupIds.join(", "),
    dupIds.length === 0
      ? "Every endpoint id is unique."
      : `Duplicate endpoint id(s): ${dupIds.join(", ")}.`,
  );
  const missingPrincipals = AUTHZ_MATRIX.filter((e) =>
    PRINCIPALS.some((p) => !(p in e.expected)),
  ).map((e) => e.id);
  add(
    "rbac.complete_coverage",
    "RBAC Matrix",
    "Every endpoint covers all principals",
    "integrity",
    missingPrincipals.length === 0 ? "pass" : "fail",
    `${PRINCIPALS.length} principals each`,
    missingPrincipals.length === 0 ? "complete" : `gaps: ${missingPrincipals.join(", ")}`,
    missingPrincipals.length === 0
      ? "Each endpoint defines an expected outcome for all 5 principals."
      : `Endpoints missing principal coverage: ${missingPrincipals.join(", ")}.`,
  );

  // ── Feature flags ────────────────────────────────────────────────────────────
  add(
    "flags.none_defined",
    "Feature Flags",
    "Feature-flag inventory",
    "integrity",
    "pass",
    "documented",
    `${snap.featureFlags.count} defined`,
    snap.featureFlags.count === 0
      ? "No feature flags are defined — behaviour is governed by RBAC + NODE_ENV."
      : `${snap.featureFlags.count} feature flag(s) defined.`,
  );

  // ── Manufacturing stage order ────────────────────────────────────────────────
  const stageNames = snap.manufacturing.stages.map((s) => s.name);
  const sequenceOk =
    stageNames.length === EXPECTED_STAGE_SEQUENCE.length &&
    EXPECTED_STAGE_SEQUENCE.every((name, i) => stageNames[i] === name);
  add(
    "mfg.stage_sequence",
    "Manufacturing",
    "Stage sequence matches canonical order",
    "integrity",
    sequenceOk ? "pass" : "fail",
    EXPECTED_STAGE_SEQUENCE.join(" → "),
    stageNames.join(" → "),
    sequenceOk
      ? `All ${stageNames.length} stages present and correctly ordered.`
      : "Manufacturing stage order has drifted from the canonical sequence.",
  );
  const dupStages = stageNames.filter((s, i) => stageNames.indexOf(s) !== i);
  add(
    "mfg.no_dup_stages",
    "Manufacturing",
    "No duplicate stage definitions",
    "duplicate",
    dupStages.length === 0 ? "pass" : "fail",
    "unique stages",
    dupStages.length === 0 ? "unique" : dupStages.join(", "),
    dupStages.length === 0
      ? "Each manufacturing stage is defined exactly once."
      : `Duplicate stage(s): ${dupStages.join(", ")}.`,
  );

  // ── Charging / balancing thresholds ──────────────────────────────────────────
  const bal = snap.manufacturing.balancing;
  add(
    "charging.balancing_positive",
    "Charging",
    "Balancing thresholds positive",
    "range",
    bal.passMaxMv > 0 && bal.warningMaxMv > 0 ? "pass" : "fail",
    "> 0 mV",
    `pass ${bal.passMaxMv} / warn ${bal.warningMaxMv}`,
    bal.passMaxMv > 0 && bal.warningMaxMv > 0
      ? "Balancing thresholds are positive."
      : "Balancing thresholds must be positive.",
  );
  add(
    "charging.balancing_ordered",
    "Charging",
    "Pass threshold below warning threshold",
    "conflict",
    bal.passMaxMv < bal.warningMaxMv ? "pass" : "fail",
    "pass < warning",
    `${bal.passMaxMv} < ${bal.warningMaxMv}`,
    bal.passMaxMv < bal.warningMaxMv
      ? "Pass/warning balancing bands are correctly ordered."
      : "Balancing pass threshold is not below the warning threshold — conflicting config.",
  );

  // ── Battery grading limits (live DB config) ──────────────────────────────────
  const g = snap.grading;
  if (!g) {
    add(
      "grading.present",
      "Battery Grading",
      "Grade config row present",
      "required",
      "fail",
      "1 singleton row",
      "missing",
      "Cell grade-config row (id=1) is missing — grading cannot operate.",
    );
  } else {
    const capOrdered =
      g.gradeAMinCapacityPct > g.gradeBMinCapacityPct &&
      g.gradeBMinCapacityPct > g.gradeCMinCapacityPct;
    add(
      "grading.capacity_monotonic",
      "Battery Grading",
      "Capacity thresholds ordered A > B > C",
      "conflict",
      capOrdered ? "pass" : "fail",
      "A > B > C",
      `${g.gradeAMinCapacityPct} / ${g.gradeBMinCapacityPct} / ${g.gradeCMinCapacityPct}`,
      capOrdered
        ? "Grade capacity thresholds decrease monotonically A→B→C."
        : "Grade capacity thresholds are not strictly decreasing — conflicting config.",
    );
    const caps = [g.gradeAMinCapacityPct, g.gradeBMinCapacityPct, g.gradeCMinCapacityPct];
    const capsInRange = caps.every((c) => c > 0 && c <= 100);
    add(
      "grading.capacity_range",
      "Battery Grading",
      "Capacity thresholds within 0–100%",
      "range",
      capsInRange ? "pass" : "fail",
      "0 < pct ≤ 100",
      caps.join(", "),
      capsInRange
        ? "All capacity thresholds are valid percentages."
        : "A capacity threshold is outside the 0–100% range.",
    );
    const irs = [g.gradeAMaxIrMult, g.gradeBMaxIrMult, g.gradeCMaxIrMult];
    const irOrdered =
      g.gradeAMaxIrMult < g.gradeBMaxIrMult &&
      g.gradeBMaxIrMult < g.gradeCMaxIrMult &&
      irs.every((m) => m >= 1);
    add(
      "grading.ir_monotonic",
      "Battery Grading",
      "IR multipliers ordered A < B < C and ≥ 1",
      "conflict",
      irOrdered ? "pass" : "fail",
      "1 ≤ A < B < C",
      irs.join(", "),
      irOrdered
        ? "IR-multiplier tolerances widen monotonically A→B→C."
        : "IR-multiplier tolerances are not strictly increasing (or below 1.0) — conflicting config.",
    );
    const tolerances: Array<[string, number]> = [
      ["maxCapacityDiffAh", g.maxCapacityDiffAh],
      ["maxIrDiffMohm", g.maxIrDiffMohm],
      ["maxVoltageDiffMv", g.maxVoltageDiffMv],
      ["nominalIrMohm", g.nominalIrMohm],
    ];
    const badTol = tolerances.filter(([, v]) => !(v > 0)).map(([k]) => k);
    add(
      "grading.tolerances_positive",
      "Battery Grading",
      "Matching tolerances positive",
      "range",
      badTol.length === 0 ? "pass" : "fail",
      "> 0",
      tolerances.map(([k, v]) => `${k}=${v}`).join(", "),
      badTol.length === 0
        ? "All matching/tolerance values are positive."
        : `Non-positive grading tolerance(s): ${badTol.join(", ")}.`,
    );
  }

  // ── Version ──────────────────────────────────────────────────────────────────
  add(
    "version.present",
    "Version",
    "API server version recorded",
    "integrity",
    snap.version.apiServer === "unknown"
      ? "fail"
      : snap.version.apiServer === "0.0.0"
        ? "warn"
        : "pass",
    "semver",
    snap.version.apiServer,
    snap.version.apiServer === "unknown"
      ? "Could not resolve the API server version."
      : snap.version.apiServer === "0.0.0"
        ? "API server version is the placeholder 0.0.0 — set a real version before production."
        : `API server version ${snap.version.apiServer}.`,
  );

  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;

  return {
    generatedAt: snap.generatedAt,
    summary: { total: checks.length, passed, warnings, failed, drift: failed > 0 },
    checks,
  };
}
