import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, signToken, decodeAuthCookie } from "../middleware/auth";
import { COOKIE_NAME, COOKIE_OPTIONS } from "../lib/security-config";
import { recordSecurityEvent, reqMeta } from "../lib/security-events";

const ASSIGNABLE_ROLES = ["director", "supervisor", "operator", "viewer"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const router: IRouter = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || !email.includes("@") || typeof password !== "string" || !password) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  // Constant-time rejection to prevent user enumeration
  const valid = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, "$2b$12$invalidhashtopreventtimingattack");

  if (!user || !user.isActive || !valid) {
    void recordSecurityEvent({
      eventType: "auth.login.failed",
      severity: "warning",
      targetEmail: email.toLowerCase(),
      ...reqMeta(req),
      statusCode: 401,
      detail: !user
        ? "No such account"
        : !user.isActive
          ? "Account disabled"
          : "Bad password",
    });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  void recordSecurityEvent({
    eventType: "auth.login.success",
    severity: "info",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    ...reqMeta(req),
    statusCode: 200,
  });

  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// POST /api/auth/register — director-only user creation (DEF-M06-002).
// OCS One is factory software: users never self-register. Only a director may
// create accounts; the endpoint is rate-limited (registerLimiter in app.ts) and
// every creation is audit-logged. No session cookie is issued for the new user.
router.post("/register", requireAuth, requireRole("director"), async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: unknown; email?: unknown; password?: unknown; role?: unknown;
  };

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  // Role defaults to least-privilege viewer; if provided it must be valid.
  let assignedRole: AssignableRole = "viewer";
  if (role !== undefined) {
    if (typeof role !== "string" || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
      res.status(400).json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` });
      return;
    }
    assignedRole = role as AssignableRole;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      role: assignedRole,
      isActive: true,
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
    });

  // DEF-M06-002: audit every user creation event (actor + target + role).
  req.log.info(
    {
      event: "user.created",
      actorId: req.user?.userId,
      actorEmail: req.user?.email,
      newUserId: user.id,
      newUserEmail: user.email,
      assignedRole: user.role,
    },
    "Director created a new user account"
  );
  void recordSecurityEvent({
    eventType: "user.created",
    severity: "info",
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    targetEmail: user.email,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Created account with role: ${user.role}`,
  });

  // No cookie is set — the director stays logged in as themselves.
  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// POST /api/auth/logout — public route (no requireAuth) so it always succeeds
// in clearing the cookie. We still decode the cookie best-effort to attribute
// the logout in the audit log; without this req.user is never populated here and
// auth.logout events would silently never be recorded.
router.post("/logout", (req, res) => {
  const actor = req.user ?? decodeAuthCookie(req);
  if (actor) {
    void recordSecurityEvent({
      eventType: "auth.logout",
      severity: "info",
      actorId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      ...reqMeta(req),
      statusCode: 200,
    });
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

// GET /api/auth/me — returns current user from JWT
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
