---
name: Cert suites exercise real endpoints — tighten contracts in lockstep
description: Tightening an endpoint's input contract can break a cert suite that drives that same endpoint as a fixture.
---

The SS-03 audit suite (and other cert suites) create their own throwaway fixtures by calling the **real production endpoints**, not by inserting rows directly. So when you add a new *required* field or a stricter role to an endpoint, every cert suite that calls it must be updated in the same change or the suite fails (e.g. HTTP 400 on fixture creation).

**Why:** cert suites prove the live contract end-to-end; they are clients of the API just like the frontend. A contract change is a breaking change for them too.

**How to apply:** when you make an endpoint's input stricter (new mandatory field, narrower role, new validation), grep `artifacts/api-server/src/cert/*.ts` for that route and update the fixture payloads/roles before running the suites. A failing cert run right after a contract change is usually *your own fixture*, not a real regression — read the crash message (it names the failing fixture call) before assuming the feature broke.
