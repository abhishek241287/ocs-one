# UI-IA-03 certification — 2026-09-15

## Result

PASS for the desktop object-page pattern across Production Order, Lot, and
Product.

## Feed-map and data boundary

- Feed-map checkpoint: `certification/ui-ia-03/ui-ia-03-feed-map.md`
- No backend files or API contracts were changed.
- Production Order Attributes, Lot Genealogy, and Product Movements are
  intentionally omitted because no valid existing feed was verified for them.
- The invalid cell-lot use of `/genealogy/downstream` was discovered during
  authenticated verification; that operation is scoped to `inventory_lots`,
  so it was removed from the Lot tab map rather than placeholdered.

## Shared pattern

- `PageShell`, `IdentityHeader`, `TabStrip`, `ObjectPanel`, and supporting
  object-page primitives are shared by all three object pages.
- Existing Production Order and Product URLs are unchanged.
- Cell Lot is surfaced at `/cells/lots/:id` from the existing Cell Receiving
  list without changing the list route.
- Every rendered Production Order and Product genealogy edge includes a
  `document_cited` badge from the verified genealogy feed.

## Authenticated visual evidence

Evidence was captured with a director login at a 1440x1100 viewport:

- `certification/fat-evidence/ui-ia-03/production-order.png`
- `certification/fat-evidence/ui-ia-03/lot.png`
- `certification/fat-evidence/ui-ia-03/product.png`
- `certification/fat-evidence/ui-ia-03/ui-ia-03-browser-result.json`

Verified routes and tabs:

- Production Order: `/manufacturing/orders/:id` → Overview, Movements,
  Genealogy, Audit; Attributes absent.
- Lot: `/cells/lots/:id` → Movements, Overview, Attributes, Audit; Genealogy
  absent.
- Product: `/products/:id` → Overview, Genealogy, Attributes, Audit; Movements
  absent.
- All three pages rendered the shared identity block and TRACE action.
- URL paths remained unchanged during tab traversal.

## Checks

- OCS One TypeScript typecheck: PASS
- OCS One production build with workflow environment: PASS
- Authenticated route evidence: PASS
- Browser console errors: 0
- Page errors: 0
- Failed requests: 0
- HTTP responses >= 400 during evidence: 0
- `git diff --check`: PASS