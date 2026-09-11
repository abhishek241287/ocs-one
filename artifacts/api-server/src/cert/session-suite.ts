// Session-generation certification for security-sensitive account changes.
// The suite exercises the real HTTP routes and verifies that an old cookie is
// rejected after password, role, and active-status changes while a fresh login
// with the current account state succeeds.
//
// Run: pnpm --filter @workspace/api-server run test:session

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const OWNER_EMAIL = process.env.CERT_OWNER_EMAIL ?? process.env.CERT_DIRECTOR_EMAIL ?? "admin@ocs.local";
const OWNER_PASSWORD =
  process.env.CERT_OWNER_PASSWORD ?? process.env.CERT_DIRECTOR_PASSWORD ?? "OCS@Admin2026!";
const OLD_PASSWORD = "TASK23!OldPassword2026";
const NEW_PASSWORD = "TASK23!NewPassword2026";

type CookieJar = string;

function cookieFromSetCookie(setCookie: string | null): CookieJar {
  const match = setCookie?.match(/ocs_token=([^;]+)/);
  if (!match) throw new Error("Login did not return an ocs_token cookie");
  return `ocs_token=${match[1]}`;
}

async function readResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; response: Response }> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await readResponse(response);
  return { status: response.status, body, response };
}

async function login(email: string, password: string): Promise<CookieJar> {
  const result = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (result.status !== 200) {
    throw new Error(`Login failed for ${email}: HTTP ${result.status}`);
  }
  return cookieFromSetCookie(result.response.headers.get("set-cookie"));
}

function withCookie(cookie: CookieJar): Record<string, string> {
  return { Cookie: cookie };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const email = `task23.${Date.now()}@cert.local`;
  let userId: string | null = null;

  try {
    const ownerCookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
    const created = await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...withCookie(ownerCookie) },
      body: JSON.stringify({
        name: "Task 23 Session Test",
        email,
        password: OLD_PASSWORD,
        role: "viewer",
      }),
    });
    assert(created.status === 201, `Fixture registration failed: HTTP ${created.status}`);

    const [user] = await db
      .select({ id: usersTable.id, sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    assert(user, "Fixture user was not created");
    userId = user.id;

    // Password change: the request succeeds, its cookie is immediately stale,
    // and the new password can establish a fresh session.
    const passwordCookie = await login(email, OLD_PASSWORD);
    const beforePasswordChange = user.sessionVersion;
    const passwordChanged = await request("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...withCookie(passwordCookie) },
      body: JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    });
    assert(passwordChanged.status === 200, `Password change failed: HTTP ${passwordChanged.status}`);

    const oldAfterPassword = await request("/api/auth/me", {
      headers: withCookie(passwordCookie),
    });
    assert(oldAfterPassword.status === 401, "Old password-change session was accepted");
    assert(
      oldAfterPassword.body?.error === "Session is no longer valid. Please log in again.",
      "Password-change session did not fail closed with the standard 401",
    );
    const [afterPassword] = await db
      .select({ sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    assert(
      afterPassword?.sessionVersion === beforePasswordChange + 1,
      "Password change did not increment session generation exactly once",
    );
    const freshPasswordCookie = await login(email, NEW_PASSWORD);
    const freshAfterPassword = await request("/api/auth/me", {
      headers: withCookie(freshPasswordCookie),
    });
    assert(freshAfterPassword.status === 200, "Fresh login after password change failed");

    // Role change: the prior fresh session must not retain the old role claim.
    const beforeRoleChange = afterPassword.sessionVersion;
    const roleChanged = await request(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...withCookie(ownerCookie) },
      body: JSON.stringify({ role: "supervisor" }),
    });
    assert(roleChanged.status === 200, `Role change failed: HTTP ${roleChanged.status}`);
    const oldAfterRole = await request("/api/auth/me", {
      headers: withCookie(freshPasswordCookie),
    });
    assert(oldAfterRole.status === 401, "Old role-change session was accepted");
    const [afterRole] = await db
      .select({ sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    assert(
      afterRole?.sessionVersion === beforeRoleChange + 1,
      "Role change did not increment session generation exactly once",
    );
    const freshAfterRole = await request("/api/auth/me", {
      headers: withCookie(await login(email, NEW_PASSWORD)),
    });
    assert(freshAfterRole.status === 200 && freshAfterRole.body?.user?.role === "supervisor", "Fresh login did not receive the new role");

    // Active-status change: disabled accounts reject both old sessions and new
    // login attempts, and reactivation permits a fresh login again.
    const activeCookie = await login(email, NEW_PASSWORD);
    const [beforeActiveRow] = await db
      .select({ sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const disabled = await request(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...withCookie(ownerCookie) },
      body: JSON.stringify({ isActive: false }),
    });
    assert(disabled.status === 200, `Active-status change failed: HTTP ${disabled.status}`);
    const oldAfterDisable = await request("/api/auth/me", {
      headers: withCookie(activeCookie),
    });
    assert(oldAfterDisable.status === 401, "Old disabled-account session was accepted");
    const [afterDisable] = await db
      .select({ sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    assert(
      afterDisable?.sessionVersion === (beforeActiveRow?.sessionVersion ?? -1) + 1,
      "Active-status change did not increment session generation exactly once",
    );
    const disabledLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: NEW_PASSWORD }),
    });
    assert(disabledLogin.status === 401, "Disabled account was able to log in");

    const reenabled = await request(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...withCookie(ownerCookie) },
      body: JSON.stringify({ isActive: true }),
    });
    assert(reenabled.status === 200, `Account reactivation failed: HTTP ${reenabled.status}`);
    assert((await login(email, NEW_PASSWORD)) !== "", "Fresh login after reactivation failed");

    console.log("✓ Session generation certification passed for password, role, and active-status changes.");
  } finally {
    if (userId) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }
}

main().catch((error) => {
  console.error(`✗ Session generation certification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});