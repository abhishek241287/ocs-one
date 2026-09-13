-- Task 70-A — Phase 4 schema foundation raw SQL supplements.
-- Run after Drizzle push creates the enum, tables, sequences, and wip link column.

DROP INDEX IF EXISTS wip_inventory_order_material_lot_issue_unique;

CREATE UNIQUE INDEX wip_inventory_identity_unique
ON wip_inventory (
  production_order_id,
  material_id,
  COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(wip_issue_note_id, issue_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_wip_inventory_po_status
  ON wip_inventory (production_order_id, status);

CREATE INDEX IF NOT EXISTS idx_wip_inventory_mat_status
  ON wip_inventory (material_id, status);

CREATE INDEX IF NOT EXISTS idx_consumption_po_status
  ON consumption_confirmations (production_order_id, status);

CREATE INDEX IF NOT EXISTS idx_it_po_state
  ON inventory_transactions (production_order_id, stock_state);