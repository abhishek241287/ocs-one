import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust Replit's reverse proxy so express-rate-limit can read the real client IP
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Vite dev needs inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
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
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);

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

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ─── Global error handler ────────────────────────────────────────────────────
// Must be registered after all routes. Express 5 forwards async throws here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
