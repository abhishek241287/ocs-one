---
name: FAT blocker suite H17 request bugs
description: Two bugs in the H17 concurrent-charger test in fat-blocker-suite.ts; correct API shape.
---

## Rule

The H17 concurrent charger reservation test in `fat-blocker-suite.ts` had two bugs that caused it to hit the wrong route with the wrong body:

### Bug 1 — Wrong URL

The suite called `/api/manufacturing/orders/:id/stages/start` (treating stage_type as a body field). The actual route is:

```
POST /api/manufacturing/orders/:id/stages/:stage/start
```

where `:stage` is a URL path parameter (e.g. `charging`), not a request body field.

### Bug 2 — Wrong body fields

The suite sent `{ stage_type: "charging", stage_data: { ... } }`. The route's Zod schema (`StartStageBody`) expects:

```typescript
{ operatorName: string, notes?: string | null, stageData?: Record<string, unknown> }
```

Note `stageData` (camelCase) not `stage_data` (snake_case), and `operatorName` is required.

**Fix:**
```javascript
// WRONG (original suite):
apiReq("POST", `/api/manufacturing/orders/${id}/stages/start`, token, {
  stage_type: "charging",
  stage_data: { chargerUnitId: "...", chargerCode: "..." },
})

// CORRECT (fixed suite):
apiReq("POST", `/api/manufacturing/orders/${id}/stages/charging/start`, token, {
  operatorName: "QA-H17-Operator",
  stageData: { chargerUnitId: "...", chargerCode: "..." },
})
```

**Why:** The discrepancy was hidden because dealer-role tests blocked at `denyDealerFactoryAccess` before the bug was exercised in the first sprint; H17 was skipped for lack of data.

**How to apply:** When writing cert suite HTTP calls against this API, always verify the exact route signature in the Zod schema (`lib/api-zod/src/generated/api.ts`) rather than inferring from the handler file name.
