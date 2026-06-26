---
name: Orval generated Zod schema naming
description: How Orval names generated Zod runtime validators vs TypeScript types, and which to use in server route handlers.
---

## The rule
In server route handlers, always import the **operation-shaped Zod schemas** from `@workspace/api-zod`, not the component-shaped TypeScript interface names.

## Why
Orval generates two kinds of exports from the OpenAPI spec:
1. **TypeScript interfaces** (type-only) — named after `components/schemas` entries: `CellMaster`, `CellMasterInput`, `CellMasterUpdate`. These exist only at compile time and cannot be used as `.safeParse()` validators.
2. **Zod runtime schemas** (runtime values) — named after operation IDs: `CreateCellMasterBody`, `GetCellMasterResponse`, `UpdateCellMasterBody`. These are actual `zod.object(...)` instances.

Using a TypeScript interface as a Zod validator compiles fine if the name happens to collide with something exported from the barrel, but fails with `TS2693: only refers to a type, but is being used as a value here` when it doesn't.

## How to apply
```ts
// WRONG — TypeScript interface, not a Zod schema
import { CellMasterInput } from "@workspace/api-zod";
const parsed = CellMasterInput.safeParse(req.body);  // TS2693

// CORRECT — Orval-generated Zod schema (operation-shaped name)
import { CreateCellMasterBody } from "@workspace/api-zod";
const parsed = CreateCellMasterBody.safeParse(req.body);  // ✓
```

Naming pattern for Orval output (based on operationId):
- List:          `ListXxxYyysResponse`, `ListXxxYyysQueryParams`
- Create:        `CreateXxxYyyBody`, `CreateXxxYyyResponse`
- Get single:    `GetXxxYyyParams`, `GetXxxYyyResponse`
- Update:        `UpdateXxxYyyParams`, `UpdateXxxYyyBody`, `UpdateXxxYyyResponse`
- Toggle status: `ToggleXxxYyyStatusParams`, `ToggleXxxYyyStatusBody`, `ToggleXxxYyyStatusResponse`
