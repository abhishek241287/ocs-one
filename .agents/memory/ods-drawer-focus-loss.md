---
name: OdsDrawer focus-loss anti-pattern
description: Inline ref callback re-running autofocus on every render steals input focus after one keystroke
---

An inline ref callback (`ref={(el) => {...}}`) on a shared drawer/modal component re-runs on EVERY render because the arrow has a new identity each time — React detaches (null) and re-attaches the node every render. If that callback performs autofocus (querySelector first input + `.focus()`), it steals focus back to the first field after each keystroke → the classic "only the first character is entered, then focus is lost" bug. It hits EVERY form that renders inside the shared drawer, not one module.

**Why:** typing → `setState` → re-render → ref re-fires → autofocus runs again.

**How to apply:** never put side-effecting logic in an inline ref callback on a shared container. Use a stable `useRef` for the node + a `useEffect` keyed on the open/visibility flag to run autofocus ONCE when the surface opens. Keep the effect deps to `[open]` so keystroke re-renders never re-trigger it. The shared surface here is `components/ods/OdsDrawer.tsx` (consumed by all master forms via `MasterEditDrawer`). When a focus/remount bug appears in one form, fix the shared surface, not the leaf form.
