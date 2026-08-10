---
name: /auth/me response shape
description: The /api/auth/me endpoint wraps the user payload under a top-level "user" key.
---

## Rule

`GET /api/auth/me` returns `{ user: { userId, email, name, role, dealerId, iat, exp } }` — the payload is nested one level deep under `user`, NOT at the top level.

**Why:** The route was designed this way to distinguish session responses from other API shapes.

**How to apply:** When reading auth/me in test suites or frontend code, always access `body.user.dealerId`, `body.user.role`, etc. — NOT `body.dealerId` directly. The `dealerId` field is `null` for factory roles (owner, director, supervisor, operator, viewer) and a UUID string for dealer-role users linked to a dealership.
