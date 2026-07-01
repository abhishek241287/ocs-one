---
name: Frontend API error extraction shape
description: The correct field for backend error payloads on a thrown API client error, and a widespread wrong-path trap in existing pages.
---

# Frontend API error extraction shape

The generated API client throws `ApiError` with the parsed JSON body on **`err.data`** (e.g. `err.data.error`). `err.response` is the raw Fetch `Response` and has **no** `.data` property.

**Trap:** many existing ocs-one pages extract errors via `e?.response?.data?.error`, which is always `undefined` — they silently fall back to their generic message string and never surface the specific backend message (422 offender lists, 409 dup, etc.).

**How to apply:** in `catch (e: any)` handlers use `e?.data?.error ?? e?.message ?? "<fallback>"`. Do not copy the `e?.response?.data?.error` pattern from neighboring pages even though it's common — it's wrong.

**Why:** operators need the real backend message for factory troubleshooting; the wrong path degrades every error toast to a generic string.
