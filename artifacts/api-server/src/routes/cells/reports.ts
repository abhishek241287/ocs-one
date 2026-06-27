import { Router, IRouter } from "express";
import { db, cellsTable, cellLotsTable, cellMatchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map((v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

// GET /cells/reports/receiving
router.get("/receiving", async (_req, res) => {
  const lots = await db
    .select()
    .from(cellLotsTable)
    .orderBy(cellLotsTable.createdAt);

  const header = csvRow(["Lot ID", "Lot Number", "Supplier", "Manufacturer", "Cell Model", "Chemistry", "Nominal Capacity (Ah)", "Invoice #", "Date Received", "Qty Received", "Received By", "Remarks"]);
  const rows = lots.map((l) =>
    csvRow([l.id, l.lotNumber, l.supplier, l.manufacturer, l.cellModel, l.cellChemistry, l.nominalCapacityAh, l.invoiceNumber, l.dateReceived, l.quantityReceived, l.receivedBy, l.remarks])
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cell-receiving-register.csv"');
  res.send([header, ...rows].join("\n"));
});

// GET /cells/reports/grading
router.get("/grading", async (_req, res) => {
  const cells = await db
    .select({
      c: cellsTable,
      lotNumber: cellLotsTable.lotNumber,
      supplier: cellLotsTable.supplier,
    })
    .from(cellsTable)
    .leftJoin(cellLotsTable, eq(cellsTable.lotId, cellLotsTable.id))
    .orderBy(cellsTable.gradedAt);

  const header = csvRow(["Cell ID", "Lot Number", "Supplier", "Status", "Grade", "Voltage (V)", "Capacity (Ah)", "IR (mΩ)", "Temp (°C)", "Machine ID", "Graded By", "Graded At", "Notes"]);
  const rows = cells.map(({ c, lotNumber, supplier }) =>
    csvRow([c.cellId, lotNumber, supplier, c.status, c.grade, c.voltageV, c.capacityAh, c.internalResistanceMohm, c.temperatureC, c.gradingMachineId, c.gradedBy, c.gradedAt?.toISOString(), c.gradingNotes])
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cell-grading-report.csv"');
  res.send([header, ...rows].join("\n"));
});

// GET /cells/reports/inventory
router.get("/inventory", async (_req, res) => {
  const cells = await db
    .select({
      c: cellsTable,
      lotNumber: cellLotsTable.lotNumber,
      supplier: cellLotsTable.supplier,
      manufacturer: cellLotsTable.manufacturer,
    })
    .from(cellsTable)
    .leftJoin(cellLotsTable, eq(cellsTable.lotId, cellLotsTable.id))
    .orderBy(cellsTable.status, cellsTable.grade);

  const header = csvRow(["Cell ID", "Lot Number", "Supplier", "Manufacturer", "Status", "Grade", "Voltage (V)", "Capacity (Ah)", "IR (mΩ)", "Created At"]);
  const rows = cells.map(({ c, lotNumber, supplier, manufacturer }) =>
    csvRow([c.cellId, lotNumber, supplier, manufacturer, c.status, c.grade, c.voltageV, c.capacityAh, c.internalResistanceMohm, c.createdAt.toISOString()])
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cell-inventory-report.csv"');
  res.send([header, ...rows].join("\n"));
});

// GET /cells/reports/matching
router.get("/matching", async (_req, res) => {
  const matches = await db
    .select()
    .from(cellMatchesTable)
    .orderBy(cellMatchesTable.createdAt);

  const header = csvRow(["Match ID", "Battery Model", "Cells/Battery", "Quantity", "Status", "Match Score", "Created By", "Created At", "Notes"]);
  const rows = matches.map((m) =>
    csvRow([m.id, m.batteryModel, m.cellsPerBattery, m.quantity, m.status, m.matchScore, m.createdBy, m.createdAt.toISOString(), m.notes])
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cell-matching-report.csv"');
  res.send([header, ...rows].join("\n"));
});

export default router;
