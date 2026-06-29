---
name: Sidebar scroll resets on navigation
description: Per-page layout wrapping remounts the shared sidebar on every nav, losing scroll/expand state
---

In the ocs-one frontend the shared layout (`AppLayout`) is rendered INSIDE each page component (~49 pages), not hoisted once around the Router. So every route change unmounts the page → unmounts `AppLayout` → unmounts the shared `Sidebar`, resetting its scroll position (and any internal component state) to defaults on each navigation.

**Why it matters:** a deep menu selection always snaps the nav back to the top — a real operator usability defect. An internal scroll ref alone does NOT survive because the component remounts.

**How to apply:** the robust localized fix (when hoisting the layout is too large/risky) is to persist the scroll container's `scrollTop` in `sessionStorage` from within the shared nav component — restore in a `useLayoutEffect` (before paint, no flash) and save on `onScroll`. The proper root-cause fix is to hoist `AppLayout` to wrap the `<Switch>` once so the sidebar never unmounts; defer that refactor unless touching the layout broadly. Any state that must persist across navigation has the same remount hazard — don't keep it in a component below the per-page layout.
