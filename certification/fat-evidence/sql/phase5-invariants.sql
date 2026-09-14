\set ON_ERROR_STOP on

-- Phase 5 invariant pack.
-- Development database only. Every SELECT returns zero for a clean gate.

CREATE TEMP TABLE phase5_invariant_results (
  check_id text PRIMARY KEY,
  violation_count bigint NOT NULL
);

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-01', count(*)
FROM inventory_reservations
WHERE reserved_qty < allocated_qty OR allocated_qty < issued_qty;

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-02', count(*)
FROM inventory_reservation_allocations
WHERE quantity <= 0;

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-03', count(*)
FROM inventory_reservation_allocations a
LEFT JOIN inventory_reservations r ON r.id = a.reservation_id
WHERE r.id IS NULL;

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-04', count(*)
FROM inventory_reservations r
WHERE r.status IN ('active', 'partially_allocated', 'fully_allocated', 'partially_issued', 'fully_issued')
  AND EXISTS (
    SELECT 1
    FROM inventory_reservations r2
    WHERE r2.id <> r.id
      AND r2.production_order_id = r.production_order_id
      AND r2.material_id = r.material_id
      AND r2.status IN ('active', 'partially_allocated', 'fully_allocated', 'partially_issued', 'fully_issued')
      AND coalesce(r2.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(r.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-05', count(*)
FROM inventory_reservation_allocations
WHERE status NOT IN ('active', 'issued', 'released', 'cancelled');

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-06', count(*)
FROM inventory_reservations
WHERE reserved_qty < 0 OR allocated_qty < 0 OR issued_qty < 0;

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-07', count(*)
FROM inventory_reservation_allocations a
WHERE a.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_reservations r WHERE r.id = a.reservation_id
  );

INSERT INTO phase5_invariant_results
SELECT 'INV-RES-08', count(*)
FROM inventory_transactions
WHERE source_document_type IN ('reservation', 'reservation_allocation');

INSERT INTO phase5_invariant_results
SELECT 'INV-WIP-01', count(*)
FROM wip_inventory
WHERE remaining_qty <> issued_qty - consumed_qty - returned_qty - scrapped_qty
   OR remaining_qty < 0;

INSERT INTO phase5_invariant_results
SELECT 'INV-WIP-02', count(*)
FROM (
  SELECT w.production_order_id,
         w.material_id,
         sum(w.remaining_qty) AS row_wip,
         (
           SELECT coalesce(sum(i.quantity), 0)
           FROM inventory_transactions i
           WHERE i.stock_state = 'wip'
             AND i.production_order_id = w.production_order_id
             AND i.material_id = w.material_id
         ) AS ledger_wip
  FROM wip_inventory w
  WHERE w.status IN ('active', 'partially_consumed')
  GROUP BY w.production_order_id, w.material_id
) x
WHERE row_wip <> ledger_wip;

INSERT INTO phase5_invariant_results
SELECT 'INV-CONS-01', count(*)
FROM consumption_confirmations
WHERE variance_qty <> actual_qty - planned_qty
   OR status NOT IN ('draft', 'confirmed', 'adjusted', 'rejected');

INSERT INTO phase5_invariant_results
SELECT 'INV-CONS-02', count(*)
FROM consumption_confirmations c
WHERE c.status IN ('confirmed', 'adjusted')
  AND NOT EXISTS (
    SELECT 1
    FROM outbox_events o
    WHERE o.aggregate_type = 'consumption_confirmation'
      AND o.aggregate_id = c.id
      AND o.event_type = 'CONSUMPTION_CONFIRMED'
  );

INSERT INTO phase5_invariant_results
SELECT 'INV-TRF-01', count(*)
FROM transfer_lines l
JOIN transfer_requests r ON r.id = l.transfer_request_id
WHERE r.status NOT IN ('draft', 'cancelled', 'rejected')
  AND l.issued_qty > 0
  AND l.issued_qty <> l.received_qty + (
    SELECT coalesce(sum(i.quantity), 0)
    FROM inventory_transactions i
    WHERE i.source_document_type = 'transfer_request'
      AND i.source_document_id = r.id
      AND i.stock_state = 'in_transit'
      AND (
        (l.lot_id IS NULL AND i.source_line_id IS NULL)
        OR (l.lot_id IS NOT NULL AND i.source_line_id = (
          SELECT grn_line_id FROM inventory_lots WHERE id = l.lot_id
        ))
      )
  );

INSERT INTO phase5_invariant_results
SELECT 'INV-TRF-02', count(*)
FROM (
  SELECT material_id, warehouse_id, lot_id, sum(quantity) AS balance
  FROM inventory_transactions
  WHERE stock_state = 'in_transit'
  GROUP BY material_id, warehouse_id, lot_id
) x
WHERE balance < 0;

INSERT INTO phase5_invariant_results
SELECT 'INV-TRF-03', count(*)
FROM transfer_requests r
WHERE r.status IN ('in_transit', 'received', 'reconciled', 'rejected')
  AND EXISTS (
    SELECT 1
    FROM transfer_lines l
    WHERE l.transfer_request_id = r.id
      AND l.issued_qty > 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM outbox_events o
    WHERE o.aggregate_type = 'transfer_request'
      AND o.aggregate_id = r.id
      AND o.event_type = 'TRANSFER_ISSUED'
  );

INSERT INTO phase5_invariant_results
SELECT 'INV-DOC-01', count(*)
FROM return_documents d
WHERE d.status = 'posted'
  AND (
    SELECT count(*)
    FROM inventory_transactions i
    WHERE i.source_document_type = 'return_document'
      AND i.source_document_id = d.id
  ) <> 2;

INSERT INTO phase5_invariant_results
SELECT 'INV-DOC-02', count(*)
FROM scrap_documents d
WHERE d.status = 'posted'
  AND (
    SELECT count(*)
    FROM inventory_transactions i
    WHERE i.source_document_type = 'scrap_document'
      AND i.source_document_id = d.id
  ) <> 2;

INSERT INTO phase5_invariant_results
SELECT 'INV-DOC-03', count(*)
FROM inventory_adjustments d
WHERE d.status = 'posted'
  AND (
    SELECT count(*)
    FROM inventory_transactions i
    WHERE i.source_document_type = 'inventory_adjustment'
      AND i.source_document_id = d.id
  ) <> 1;

INSERT INTO phase5_invariant_results
SELECT 'INV-DOC-04', count(*)
FROM inventory_transactions i
WHERE (i.source_document_type = 'return_document'
       AND NOT EXISTS (SELECT 1 FROM return_documents d WHERE d.id = i.source_document_id))
   OR (i.source_document_type = 'scrap_document'
       AND NOT EXISTS (SELECT 1 FROM scrap_documents d WHERE d.id = i.source_document_id))
   OR (i.source_document_type = 'inventory_adjustment'
       AND NOT EXISTS (SELECT 1 FROM inventory_adjustments d WHERE d.id = i.source_document_id))
   OR (i.source_document_type = 'transfer_request'
       AND NOT EXISTS (SELECT 1 FROM transfer_requests d WHERE d.id = i.source_document_id));

INSERT INTO phase5_invariant_results
SELECT 'INV-LEDGER-01', count(*)
FROM (
  SELECT t.material_id, t.stock_state, sum(t.quantity) AS balance
  FROM inventory_transactions t
  GROUP BY t.material_id, t.stock_state
) x
JOIN master_materials m ON m.id = x.material_id
WHERE x.balance < 0;

SELECT check_id, violation_count
FROM phase5_invariant_results
ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM phase5_invariant_results
    WHERE violation_count <> 0
  ) THEN
    RAISE EXCEPTION 'Phase 5 invariant pack failed';
  END IF;
END $$;

DROP TABLE phase5_invariant_results;