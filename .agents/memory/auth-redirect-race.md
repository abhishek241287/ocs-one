---
name: Auth login redirect race
description: Why post-login redirect can bounce back to /login, and the fix.
---

# Login redirect race (React Query + route guard)

After a successful login, an auth-guarded layout can bounce the user straight back to `/login` even though the API returned 200.

**Cause:** The login page's `useAuth`/`me` query has already run once and cached `null` (initial `/api/auth/me` → 401). If `useLogin.onSuccess` only calls `invalidateQueries` (an *async* refetch) and the page immediately navigates to a guarded route, the guard evaluates `!isLoading && !isAuthenticated` while the cache is still `null` (`isLoading` is false because data already exists) and redirects to `/login` before the refetch resolves. Once on `/login` (no guard), nothing redirects back — the app looks stuck despite a 200 login.

**Fix:** In `onSuccess`, write the returned user into the cache *synchronously* — `queryClient.setQueryData(AUTH_KEY, user)` — instead of relying on `invalidateQueries`. Auth state is authenticated the instant the redirect fires. Apply to both login and register.

**Why:** Mutation `onSuccess` + `invalidateQueries` is eventual; a synchronous navigation races it. When a guard reads the same query, seed the cache, don't just invalidate.

**How to apply:** Any time a mutation's success must be immediately reflected by a route guard or redirect that reads a React Query cache, `setQueryData` the authoritative response rather than invalidating-and-refetching.
