# UI-IA-03 feed-map checkpoint

Verified against the existing OpenAPI operations, generated client hooks, and
current route consumers before implementation. No new backend endpoint is
introduced by UI-IA-03.

| Object | Tab | Existing feed | Decision |
|---|---|---|---|
| Production Order | Overview | `GET /api/manufacturing/orders/:id` | Included |
| Production Order | Movements | `GET /api/manufacturing/orders/:id/material-issues` | Included |
| Production Order | Genealogy | `GET /api/genealogy/upstream?production_order_id=:id` | Included; citation badges render on issue, allocation, attribute, and bulk edges |
| Production Order | Attributes | No dedicated existing feed | **Omitted** |
| Production Order | Audit | `GET /api/manufacturing/orders/:id/timeline` | Included |
| Lot | Overview | `GET /api/cells/lots/:id` | Included |
| Lot | Movements | `GET /api/inventory/transfers/:transferId` from the lot's existing `transferId` | Included when the lot has a source transfer |
| Lot | Genealogy | No valid existing cell-lot genealogy feed; the downstream operation is scoped to `inventory_lots`, not `cell_lots` | **Omitted** |
| Lot | Attributes | `GET /api/cells/lots/:id` | Included; the existing detail projection is the source |
| Lot | Audit | `GET /api/cells/lots/:id/history` | Included |
| Product | Overview | `GET /api/products/:id` plus existing `GET /api/products/:id/traceability` | Included |
| Product | Movements | No existing product movement feed | **Omitted** |
| Product | Genealogy | `GET /api/genealogy/composition?product_id=:id` | Included; product, order, lot, and cell edges show citations |
| Product | Attributes | `GET /api/products/:id` | Included |
| Product | Audit | `GET /api/products/:id/events` | Included |

## Stop-list

No endpoint was added or changed. Production Order Attributes, Lot Genealogy,
and Product Movements remain omitted rather than placeholdered. Any future
request for those feeds requires separate data-boundary ratification.

## Pattern contract

All three object pages use the same `PageShell`, `IdentityHeader`, and
`TabStrip` primitives. Existing Production Order and Product URLs are
unchanged. The Lot object page adds a detail route from the existing lot list;
the list route and all existing routes remain preserved.