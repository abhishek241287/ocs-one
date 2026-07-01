---
name: Manufacturing genealogy — avoid double-counting new consumers
description: Why a new component-consuming feature (e.g. Material Issue Note) must NOT also write mfg_battery_genealogy rows.
---

# Manufacturing genealogy write-vs-read

Order-level component genealogy (`mfg_battery_genealogy`) is already populated by the **stage cards** as manufacturing progresses (cabinet, busbar, connector, BMS, charger, cell allocation each write their own genealogy rows at their stage).

**Rule:** a NEW feature that consumes/records the same physical components (e.g. a BOM-driven Material Issue Note) must **NOT** also insert `mfg_battery_genealogy` rows — the stages already record those parts, so a second writer double-counts the same component in the genealogy view.

**How to apply:** expose the new feature's material breakdown as a **read-time projection** (fetch the active document and render its lines), not as extra genealogy rows. Reserve `mfg_battery_genealogy` writes for the stage engine only. Append-only *timeline* events (`materials_issued` / `materials_issue_reversed` on `mfg_battery_timeline`) are fine — those are audit events, not genealogy component rows.

**Why:** the genealogy view is a union over genealogy rows; two independent writers for the same part inflate counts and break traceability integrity.
