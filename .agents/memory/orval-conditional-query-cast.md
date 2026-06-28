---
name: Orval useQuery conditional enabled cast
description: Why generated Orval React Query hooks need `} as any` when passing only `{ query: { enabled } }`
---

When calling an Orval-generated `useXxx(id, { query: { enabled } })` hook with ONLY an
`enabled` flag (no `queryKey`), TypeScript errors with TS2741 "Property 'queryKey' is
missing in type '{ enabled: boolean }'". The generated option type resolves to the full
`UseQueryOptions` which marks `queryKey` required in this React Query version.

**How to apply:** append `} as any` to the options object, matching the existing
convention across the ocs-one frontend (e.g. GrnDetailPage, DealerPortalPage):
`useDealerInventory(id, { query: { enabled } } as any)`. Not a runtime concern — the
hook injects its own queryKey internally; the cast only silences the type requirement.
