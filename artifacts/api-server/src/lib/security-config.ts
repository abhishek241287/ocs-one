// ─── Security configuration — single source of truth ──────────────────────────
// Centralises CSP directives, rate-limit policy, cookie options, and JWT policy
// so that app.ts/auth.ts apply exactly the values the /developer/security
// dashboard introspects. The dashboard reads from here rather than re-describing
// configuration, so what is displayed is provably what is enforced.

export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"], // Vite dev needs inline scripts
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'"],
};

export interface RateLimitPolicy {
  name: string;
  scope: string;
  windowMs: number;
  max: number;
  description: string;
}

export const RATE_LIMITS: Record<"global" | "auth" | "register", RateLimitPolicy> = {
  global: {
    name: "global",
    scope: "/api",
    windowMs: 60_000,
    max: 300,
    description: "All API traffic, per IP.",
  },
  auth: {
    name: "auth",
    scope: "/api/auth/login",
    windowMs: 15 * 60_000,
    max: 20,
    description: "Login attempts, per IP (brute-force protection).",
  },
  register: {
    name: "register",
    scope: "/api/auth/register",
    windowMs: 15 * 60_000,
    max: 20,
    description: "Director-only account creation, per IP.",
  },
};

// Replit's reverse proxy adds exactly one X-Forwarded-For hop. Centralised here
// so app.ts applies it and SS-04 can verify it never drifts (wrong value breaks
// client-IP attribution and therefore rate limiting).
export const TRUST_PROXY = 1;

export const COOKIE_NAME = "ocs_token";

export const JWT_EXPIRES_IN = "8h";
export const JWT_ALGORITHM = "HS256";
const JWT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: JWT_MAX_AGE_MS,
  path: "/",
};

/** Non-sensitive JWT/session configuration for the security dashboard. Never
 * exposes the signing secret — only whether one is configured. */
export function describeJwtConfig() {
  return {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
    transport: "httpOnly cookie",
    cookieName: COOKIE_NAME,
    httpOnly: COOKIE_OPTIONS.httpOnly,
    sameSite: COOKIE_OPTIONS.sameSite,
    secure: COOKIE_OPTIONS.secure,
    secretConfigured: Boolean(process.env.SESSION_SECRET),
  };
}

/** CSP directives rendered for the dashboard, flagging weakened directives. */
export function describeCspStatus() {
  const directives = Object.entries(CSP_DIRECTIVES).map(([name, values]) => ({
    directive: name,
    values,
    unsafe: values.some((v) => v.includes("unsafe")),
  }));
  return {
    enabled: true,
    directives,
    weakened: directives.filter((d) => d.unsafe).map((d) => d.directive),
  };
}
