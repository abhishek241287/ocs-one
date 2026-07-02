import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@workspace/db";
import { recordSecurityEvent, reqMeta } from "../lib/security-events";
import { JWT_EXPIRES_IN } from "../lib/security-config";

/** Persist an authorization (403) denial to the audit log. */
function recordDenial(req: Request, required: UserRole[]): void {
  void recordSecurityEvent({
    eventType: "authz.denied",
    severity: "warning",
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 403,
    detail: `Denied; required role: ${required.join(" or ")}`,
  });
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Augment Express Request with the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.ocs_token as string | undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, getSecret()) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

/**
 * Best-effort decode of the auth cookie that NEVER rejects the request. Returns
 * the token payload if a valid session is present, else null. Used by endpoints
 * like logout that must always succeed (clear the cookie) but should still
 * attribute the action to the user when a valid session exists — so audit
 * logging is deterministic instead of silently dropping every logout event.
 */
export function decodeAuthCookie(req: Request): AuthTokenPayload | null {
  const token = req.cookies?.ocs_token as string | undefined;
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Owner is unrestricted — passes every role gate (six-role RBAC).
    if (req.user.role === "owner") {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      recordDenial(req, roles);
      res.status(403).json({ error: `Access denied. Required role: ${roles.join(" or ")}` });
      return;
    }
    next();
  };
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Mount at router level: read methods (GET/HEAD) pass through for any
 * authenticated user (viewer is read-only everywhere), while write methods
 * (POST/PUT/PATCH/DELETE) require one of the given roles. Directors should be
 * included in every list. Enforces RBAC per Security Standard SS-01.
 */
export function requireWriteRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!WRITE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Owner is unrestricted — passes every write gate (six-role RBAC).
    if (req.user.role === "owner") {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      recordDenial(req, roles);
      res.status(403).json({ error: `Access denied. Required role: ${roles.join(" or ")}` });
      return;
    }
    next();
  };
}

/**
 * Dealer is an external portal-only role (Factory Ready v1.0): it may authenticate
 * and read its own session (/auth/me) but has NO access to any factory module.
 * Mount this globally right after requireAuth so EVERY factory route — reads
 * included — returns 403 for a dealer. Dealer self-service data (scoped inventory /
 * dispatch history) is Dealer Portal v2, out of scope this sprint.
 */
export function denyDealerFactoryAccess(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === "dealer") {
    void recordSecurityEvent({
      eventType: "authz.denied",
      severity: "warning",
      actorId: req.user.userId,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      ...reqMeta(req),
      statusCode: 403,
      detail: "Dealer role has no factory access (Dealer Portal only)",
    });
    res.status(403).json({ error: "Access denied. Dealer accounts cannot access factory modules." });
    return;
  }
  next();
}

export function signToken(payload: Omit<AuthTokenPayload, "iat" | "exp">): string {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN });
}
