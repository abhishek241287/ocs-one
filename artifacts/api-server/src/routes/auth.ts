import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, logisticsDealersTable, usersTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requireRole, signToken, decodeAuthCookie } from "../middleware/auth";
import { COOKIE_NAME, COOKIE_OPTIONS } from "../lib/security-config";
import { recordSecurityEvent, reqMeta } from "../lib/security-events";
import {
  UpdateAuthUserDealerBody,
  UpdateAuthUserDealerParams,
} from "@workspace/api-zod";

const ASSIGNABLE_ROLES = ["owner", "director", "supervisor", "operator", "viewer", "dealer"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// Six-role RBAC user-creation hierarchy (Factory Ready v1.0). Maps a CREATOR's
// role → the roles they may assign. Only Owner may create/promote another Owner;
// Director runs the operational org (incl. external Dealer accounts) but cannot
// mint an Owner; Supervisor may create front-line Operator/Viewer accounts only.
const CREATION_HIERARCHY: Record<string, readonly AssignableRole[]> = {
  owner: ["owner", "director", "supervisor", "operator", "viewer", "dealer"],
  director: ["director", "supervisor", "operator", "viewer", "dealer"],
  supervisor: ["operator", "viewer"],
  operator: [],
  viewer: [],
  dealer: [],
};

const router: IRouter = Router();

const userAccountProjection = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  dealerId: usersTable.dealerId,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

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
    dealerId: user.dealerId ?? null,
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
    user: { id: user.id, email: user.email, name: user.name, role: user.role, dealerId: user.dealerId ?? null },
  });
});

// POST /api/auth/register — hierarchical user creation (DEF-M06-002, six-role RBAC).
// OCS One is factory software: users never self-register. Only Owner/Director/
// Supervisor may create accounts, and only within their creation hierarchy
// (CREATION_HIERARCHY) — e.g. supervisors cannot mint directors and only an owner
// creates another owner. The endpoint is rate-limited (registerLimiter in app.ts)
// and every creation is audit-logged. No session cookie is issued for the new user.
router.post("/register", requireAuth, requireRole("owner", "director", "supervisor"), async (req, res) => {
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

  // Enforce the creation hierarchy: the creator may only assign roles within their
  // authority (supervisors cannot mint directors; only owners create owners).
  const creatorRole = req.user?.role ?? "";
  const creatable = CREATION_HIERARCHY[creatorRole] ?? [];
  if (!creatable.includes(assignedRole)) {
    void recordSecurityEvent({
      eventType: "authz.denied",
      severity: "warning",
      actorId: req.user?.userId ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      targetEmail: email.toLowerCase(),
      ...reqMeta(req),
      statusCode: 403,
      detail: `Role ${creatorRole} may not create a ${assignedRole} account`,
    });
    res.status(403).json({ error: `Your role may not create a "${assignedRole}" account` });
    return;
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

// GET /api/auth/users — director/owner-only account list for access management.
// Password hashes and other session-sensitive fields are intentionally excluded.
router.get("/users", requireAuth, requireRole("owner", "director"), async (_req, res) => {
  const items = await db
    .select(userAccountProjection)
    .from(usersTable)
    .orderBy(asc(usersTable.name), asc(usersTable.email));

  res.json({ items, total: items.length });
});

// PATCH /api/auth/users/:id/dealer — associate a dealer-role user with an
// active dealership. Null explicitly unlinks the user from their current dealer.
router.patch(
  "/users/:id/dealer",
  requireAuth,
  requireRole("owner", "director"),
  async (req, res) => {
    const { id } = UpdateAuthUserDealerParams.parse(req.params);
    const { dealerId } = UpdateAuthUserDealerBody.parse(req.body);

    const [target] = await db
      .select(userAccountProjection)
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "User account not found" });
      return;
    }
    if (target.role !== "dealer") {
      res.status(400).json({ error: "Only dealer-role users can be linked to a dealership" });
      return;
    }

    let dealerName: string | null = null;
    let dealerCode: string | null = null;
    if (dealerId) {
      const [dealer] = await db
        .select({
          id: logisticsDealersTable.id,
          dealerName: logisticsDealersTable.dealerName,
          dealerCode: logisticsDealersTable.dealerCode,
          status: logisticsDealersTable.status,
        })
        .from(logisticsDealersTable)
        .where(eq(logisticsDealersTable.id, dealerId))
        .limit(1);

      if (!dealer) {
        res.status(404).json({ error: "Dealer not found" });
        return;
      }
      if (dealer.status !== "active") {
        res.status(400).json({ error: "Only active dealers can be assigned to a user" });
        return;
      }
      dealerName = dealer.dealerName;
      dealerCode = dealer.dealerCode;
    }

    if (target.dealerId === dealerId) {
      res.json(target);
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ dealerId, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning(userAccountProjection);

    void recordSecurityEvent({
      eventType: "user.dealer_assignment_changed",
      severity: "info",
      actorId: req.user?.userId ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      targetEmail: target.email,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Dealer assignment changed for ${target.email}: ${target.dealerId ?? "unassigned"} → ${dealerId ?? "unassigned"}${dealerCode ? ` (${dealerCode} — ${dealerName})` : ""}`,
    });

    req.log.info(
      {
        event: "user.dealer_assignment_changed",
        actorId: req.user?.userId,
        targetUserId: target.id,
        targetEmail: target.email,
        previousDealerId: target.dealerId,
        dealerId,
      },
      "Updated dealer assignment for user account"
    );

    res.json(updated);
  }
);

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
