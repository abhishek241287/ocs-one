# OCS One — Security Report
**Date:** 2026-06-27  
**Scope:** API authentication, authorization, input validation, SQL injection, CORS, rate limiting

---

## Critical Findings

### S1 — NO AUTHENTICATION ENFORCED (CRITICAL)

**Severity: CRITICAL — Blocks production launch**

The login form in `LoginPage.tsx` is entirely cosmetic. Submitting the form redirects to `/dashboard` — no server call is made, no token is stored, no session is created:

```ts
// artifacts/ocs-one/src/pages/LoginPage.tsx
const handleLogin = (e: React.FormEvent) => {
  e.preventDefault();
  setLocation("/dashboard");   // ← just a client-side redirect
};
```

Every API endpoint is fully public. Any person who knows the URL of the deployed app can:
- Read all production orders, cell inventory, and dispatch data
- Create, modify, or delete production orders
- Approve or reject manufacturing stages
- Modify master data (products, BMS specs, cell grades)

There is no auth middleware registered in `app.ts`. No JWT validation, no session check, no API key requirement.

**Required before production:**
1. Choose an auth strategy: Replit Auth (OIDC), Clerk, or a session-based system
2. Add auth middleware to `app.ts` before the `/api` router
3. Add route guards in the React app (`ProtectedRoute` wrapper in `App.tsx`)
4. Store the session/token securely (httpOnly cookie preferred over localStorage)

---

### S2 — CORS Wildcard (HIGH)

**Location:** `artifacts/api-server/src/app.ts:28`

```ts
app.use(cors());   // ← allows any origin
```

With no origin configuration, the API accepts cross-origin requests from any domain. Combined with the absence of authentication, this means any website can make authenticated-looking requests to the API from a user's browser.

**Fix:**
```ts
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"],
  credentials: true,
}));
```

In production, set `ALLOWED_ORIGINS` to the Replit `.replit.app` domain and any custom domain.

---

### S3 — No Rate Limiting (HIGH)

No rate-limiting middleware exists anywhere in the application. The `/api/manufacturing/orders` POST endpoint has no request throttle, meaning:
- Brute-force attacks against the (future) auth endpoints
- Accidental or intentional flooding of the order creation endpoint
- The director dashboard's 18-query aggregation can be hammered freely

**Fix:** Add `express-rate-limit` globally and stricter limits on mutation endpoints:
```ts
import rateLimit from "express-rate-limit";

// Global: 200 req/min per IP
app.use("/api", rateLimit({ windowMs: 60_000, max: 200 }));

// Strict on mutations: 20 req/min per IP
app.use("/api/manufacturing/orders", rateLimit({ windowMs: 60_000, max: 20 }));
```

---

## Medium Findings

### S4 — No Input Validation on UUID Path Parameters (MEDIUM)

Most route handlers call `.parse(req.params)` via Zod schemas (e.g. `GetProductionOrderParams.parse(req.params)`), which validates that `id` is a valid UUID. However, the `masters/common.ts` generic router reads `req.params.id as string` directly without validation:

```ts
// masters/common.ts — Get, Update, Toggle Status handlers
const id = req.params.id as string;  // ← no UUID format check
```

A malformed UUID (e.g. `'; DROP TABLE mfg_production_orders; --`) passed to Drizzle's `eq(table.id, id)` is parameterized by `pg`, so SQL injection is not possible. However, PostgreSQL will throw a `22P02 invalid_input_syntax for type uuid` error, which will propagate as an unhandled 500. Add `z.string().uuid().parse(req.params.id)` in the generic router.

### S5 — No SQL Injection Risk (CONFIRMED SAFE)

All database access goes through Drizzle ORM's query builder with parameterized values. The `sql<T>` tagged template in `director.ts` uses Drizzle's `filter()` method with Drizzle operators, not string interpolation of user input. No raw SQL string concatenation found anywhere in the codebase.

**SQL injection risk: None identified.**

### S6 — Error Messages Leak Internal Details (LOW)

Zod v4 `.message` property on a failed parse returns the full Zod error description, which can include field names and schema structure:

```ts
res.status(400).json({ error: parsed.error.message });
```

Example response: `"Invalid input: Expected string, received number at path: productId"` — this leaks internal field names to the caller. For a B2B internal ERP this is low risk, but for a customer-facing API, standardize error messages.

**Fix:** Return `parsed.error.issues` in development, a generic message in production:
```ts
res.status(400).json({
  error: "Validation failed",
  ...(process.env.NODE_ENV !== "production" && { issues: parsed.error.issues }),
});
```

### S7 — No File Upload Validation

Several stage cards have fields for `photos` stored as a JSONB array `{ id, name, url, uploadedAt }`. There is no file upload endpoint in the API — photos are referenced by URL only. If a file upload feature is added in the future, it must enforce:
- MIME type validation (not just file extension)
- File size limits
- Virus/malware scanning for an enterprise context
- Signed upload URLs (presigned S3 URLs) rather than direct upload to the API server

### S8 — No Helmet.js (LOW)

No security headers middleware (`helmet`) is set. Missing headers:
- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (required for HTTPS production)

**Fix:** `app.use(helmet())` before other middleware in `app.ts`.

---

## Summary Table

| ID | Finding | Severity | Blocks Production? |
|---|---|---|---|
| S1 | No authentication | CRITICAL | ✅ Yes |
| S2 | CORS wildcard | HIGH | ✅ Yes |
| S3 | No rate limiting | HIGH | Recommended |
| S4 | UUID path param not validated in masters | MEDIUM | No |
| S5 | SQL injection | None | — |
| S6 | Error message leakage | LOW | No |
| S7 | No file upload validation | LOW | No (no uploads yet) |
| S8 | No Helmet.js | LOW | Recommended |
