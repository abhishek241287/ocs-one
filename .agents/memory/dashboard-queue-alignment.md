---
name: Dashboard queue alignment
description: Rule for keeping dashboard shortcut counts honest
---

Every My Work KPI must count the exact dataset consumed by its destination
route. An adjacent workflow milestone can be operationally related but still
produce a misleading shortcut when the destination lists another entity or
status.

**Why:** Authenticated UI evidence exposed a dispatch shortcut that counted
approved packing stages while the destination listed packed serialized
Products. The two values diverged even though both were described as
dispatch-ready.

**How to apply:** When adding or changing a dashboard shortcut, trace the
destination query first and reuse that same entity/status definition for the
KPI. Verify the displayed count against the destination in an authenticated
browser session.