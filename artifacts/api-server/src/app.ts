import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordRequest } from "./lib/metrics";
import { CSP_DIRECTIVES, RATE_LIMITS } from "./lib/security-config";
import { recordSecurityEvent, reqMeta } from "./lib/security-events";

const app: Express = express();

// Trust Replit's reverse proxy so express-rate-limit can read the real client IP
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
// CSP directives come from the shared security-config so the /developer/security
// dashboard introspects exactly what is enforced here.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: CSP_DIRECTIVES,
    },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  })
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Limits come from the shared security-config. Every breach is recorded to the
// security_events audit log (powers the dashboard "rate-limit events" panel).
function rateLimitHandler(name: string, message: string) {
  return (req: Request, res: Response) => {
    void recordSecurityEvent({
      eventType: "ratelimit.exceeded",
      severity: "warning",
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      actorId: req.user?.userId ?? null,
      ...reqMeta(req),
      statusCode: 429,
      detail: `Rate limit "${name}" exceeded`,
    });
    res.status(429).json({ error: message });
  };
}

const GLOBAL_MSG = "Too many requests. Please slow down.";
const AUTH_MSG = "Too many login attempts. Try again later.";
const REGISTER_MSG = "Too many account creation attempts. Try again later.";

const globalLimiter = rateLimit({
  windowMs: RATE_LIMITS.global.windowMs,
  max: RATE_LIMITS.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("global", GLOBAL_MSG),
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("auth", AUTH_MSG),
});

// DEF-M06-002: throttle the director-only user-creation endpoint.
const registerLimiter = rateLimit({
  windowMs: RATE_LIMITS.register.windowMs,
  max: RATE_LIMITS.register.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("register", REGISTER_MSG),
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", registerLimiter);

// ─── Request parsing ──────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── API latency metrics collector ────────────────────────────────────────────
// Records per-route request duration into an in-memory ring buffer that powers
// the /developer/performance engineering health dashboard. Must run before routes.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordRequest(req.method, req.originalUrl, ms, res.statusCode);
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ─── Global error handler ────────────────────────────────────────────────────
// Must be registered after all routes. Express 5 forwards async throws here.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Zod v4 validation error — duck-typed to avoid direct zod dependency
  if (
    typeof err === "object" &&
    err !== null &&
    err.name === "ZodError" &&
    Array.isArray(err.issues)
  ) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  // PostgreSQL constraint violations — Drizzle wraps pg errors in _DrizzleQueryError
  // so check both err and err.cause for the error code.
  const pgCode = (err as any)?.code ?? (err as any)?.cause?.code;
  // 23505 — unique constraint violation → 409
  if (pgCode === "23505") {
    const detail = String(
      (err as any)?.detail ?? (err as any)?.cause?.detail ?? ""
    );
    const match = detail.match(/Key \((.+?)\)=\((.+?)\)/);
    const field = match?.[1] ?? "field";
    const value = match?.[2] ?? "";
    const msg = field !== "field"
      ? `${field} "${value}" already exists`
      : "A record with that value already exists";
    res.status(409).json({ error: msg });
    return;
  }
  // 23503 — foreign key violation → 400
  if (pgCode === "23503") {
    const constraint = String(
      (err as any)?.constraint ?? (err as any)?.cause?.constraint ?? ""
    );
    const msg = constraint
      ? `Referenced record does not exist (${constraint})`
      : "Referenced record does not exist";
    res.status(400).json({ error: msg });
    return;
  }
  // All other errors → 500
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
