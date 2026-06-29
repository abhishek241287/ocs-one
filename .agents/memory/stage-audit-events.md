---
name: Manufacturing stage audit events
description: How stage lifecycle events are named/recorded on the battery timeline and consumed by the UI
---

# Manufacturing stage audit events

`mfg_battery_timeline.event_type` is **free-text** (no DB enum). The canonical generic
lifecycle events are `stage_started` / `stage_paused` / `stage_resumed` /
`stage_completed` / `stage_approved` / `stage_rejected` (+ `order_created`,
`qc_approved` / `qc_rejected`).

**Rule:** never hardcode a stage-specific audit event name (e.g. `charging_paused`)
for an action that applies to ALL stages. Emit the generic `stage_*` event and put the
stage name in the human-readable `description`.

**Why:** pause/resume originally emitted `charging_paused`/`charging_resumed` for every
stage (a copy-paste from the charging stage) — wrong actor/stage attribution in the
audit trail. Fixed to generic `stage_paused`/`stage_resumed`.

**How to apply:** the frontend `TimelineView` icon/color map is the display consumer —
any new `event_type` MUST be added there or it renders unstyled. Keep legacy aliases
(`charging_paused`/`charging_resumed`) in the map too: historical rows still carry them.
