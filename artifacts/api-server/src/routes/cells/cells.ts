import { Router, IRouter } from "express";
import { requireWriteRole, requireRole } from "../../middleware/auth";
import { db, cellsTable, cellLotsTable, cellGradeConfigTable, cellLotEventsTable, mfgProductionOrdersTable, mfgBatteryGenealogyTable } from "@workspace/db";
import type { EngineeringCorrection } from "@workspace/db";
import { eq, ilike, and, or, desc, count } from "drizzle-orm";
import { ListCellsQueryParams, GradeCellBody, CorrectCellBody } from "@workspace/api-zod";
import { EngineeringCorrectionService, EcfValidationError, EcfAuthorizationError } from "@workspace/ecf";

const router: IRouter = Router({ mergeParams: true });

// RBAC (DEF-M06-001): cell grading — operator, supervisor, director.
router.use(requireWriteRole("operator", "supervisor", "director"));

type CellStatus = typeof cellsTable.status._.data;
type CellGrade = typeof cellsTable.grade._.data;
type LotStatus = typeof cellLotsTable.status._.data;

// Thrown inside the correction transaction to roll back and map to an HTTP
// status — lets the in-transaction (row-locked) status re-validation reject a
// cell whose state changed after the pre-check, without a partial write.
class CorrectionStateError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CorrectionStateError";
  }
}

// Map a generic ECF ledger row back to the Cell Grading-specific CellMeasurement
// response shape (API contract unchanged). The measured values live in newValue;
// lotId is carried in metadata; the human Correction ID is surfaced as-is.
function toCellMeasurement(row: EngineeringCorrection) {
  const nv = (row.newValue ?? {}) as Record<string, unknown>;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    cellId: row.entityId,
    lotId: (meta.lotId as string | undefined) ?? null,
    sequence: row.sequence,
    measurementType: row.correctionType,
    voltageV: nv.voltageV as number,
    capacityAh: nv.capacityAh as number,
    internalResistanceMohm: nv.internalResistanceMohm as number,
    temperatureC: (nv.temperatureC as number | null) ?? null,
    gradingMachineId: (nv.gradingMachineId as string | null) ?? null,
    grade: (nv.grade as string | null) ?? null,
    status: nv.status as string,
    overrideStatus: (nv.overrideStatus as string | null) ?? null,
    gradedBy: row.performedBy,
    correctionReason: row.reason ?? null,
    gradingNotes: (nv.gradingNotes as string | null) ?? null,
    createdAt: row.createdAt,
    correctionId: row.correctionId,
  };
}

function calcGrade(
  capacityAh: number,
  irMohm: number,
  nominalCapAh: number,
  cfg: {
    gradeAMinCapacityPct: number;
    gradeAMaxIrMult: number;
    gradeBMinCapacityPct: number;
    gradeBMaxIrMult: number;
    gradeCMinCapacityPct: number;
    gradeCMaxIrMult: number;
    nominalIrMohm: number;
  }
): CellGrade {
  const capPct = (capacityAh / nominalCapAh) * 100;
  const irMult = irMohm / cfg.nominalIrMohm;

  if (capPct >= cfg.gradeAMinCapacityPct && irMult <= cfg.gradeAMaxIrMult) return "A";
  if (capPct >= cfg.gradeBMinCapacityPct && irMult <= cfg.gradeBMaxIrMult) return "B";
  if (capPct >= cfg.gradeCMinCapacityPct && irMult <= cfg.gradeCMaxIrMult) return "C";
  return "reject";
}

// GET /cells
router.get("/", async (req, res) => {
  const query = ListCellsQueryParams.parse(req.query);
  const { page, pageSize, search, status, grade, lotId } = query as {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    grade?: string;
    lotId?: string;
  };

  const conditions = [];
  if (search) {
    conditions.push(ilike(cellsTable.cellId, `%${search}%`));
  }
  if (status) {
    conditions.push(eq(cellsTable.status, status as CellStatus));
  }
  if (grade) {
    conditions.push(eq(cellsTable.grade, grade as CellGrade));
  }
  if (lotId) {
    conditions.push(eq(cellsTable.lotId, lotId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * pageSize;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cellsTable)
      .where(where)
      .orderBy(desc(cellsTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(cellsTable).where(where),
  ]);

  res.json({
    items,
    meta: {
      total: Number(total),
      page,
      pageSize,
      totalPages: Math.ceil(Number(total) / pageSize),
    },
  });
});

// GET /cells/:id
router.get("/:id", async (req, res) => {
  const [cell] = await db
    .select()
    .from(cellsTable)
    .where(eq(cellsTable.id, req.params.id));

  if (!cell) {
    res.status(404).json({ error: "Cell not found" });
    return;
  }

  const [lot] = await db
    .select()
    .from(cellLotsTable)
    .where(eq(cellLotsTable.id, cell.lotId));

  const genealogyRows = await db
    .select({
      orderId: mfgBatteryGenealogyTable.productionOrderId,
      orderNumber: mfgProductionOrdersTable.orderNumber,
      batteryNumber: mfgProductionOrdersTable.batteryNumber,
    })
    .from(mfgBatteryGenealogyTable)
    .leftJoin(
      mfgProductionOrdersTable,
      eq(mfgBatteryGenealogyTable.productionOrderId, mfgProductionOrdersTable.id)
    )
    .where(
      and(
        eq(mfgBatteryGenealogyTable.componentType, "cell"),
        ilike(mfgBatteryGenealogyTable.serialNumber, cell.cellId)
      )
    );

  res.json({
    ...cell,
    lot: lot ?? null,
    usedInOrders: genealogyRows.map((r) => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      batteryNumber: r.batteryNumber,
    })),
  });
});

// POST /cells/:id/grade
router.post("/:id/grade", async (req, res) => {
  const body = GradeCellBody.parse(req.body);

  // DEF-CW02-005: operator attribution must not be blank/whitespace-only. The
  // schema enforces minLength 1, but " " has length 1 — trim server-side so an
  // audit record can never carry an anonymous operator.
  const gradedBy = body.gradedBy.trim();
  if (gradedBy.length === 0) {
    res.status(400).json({ error: "gradedBy is required and cannot be blank" });
    return;
  }

  const [cell] = await db
    .select()
    .from(cellsTable)
    .where(eq(cellsTable.id, req.params.id));

  if (!cell) {
    res.status(404).json({ error: "Cell not found" });
    return;
  }

  if (cell.status !== "received" && cell.status !== "grading") {
    res.status(400).json({ error: `Cell status is '${cell.status}' — only received or grading cells can be graded` });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [lotRow] = await tx
      .select()
      .from(cellLotsTable)
      .where(eq(cellLotsTable.id, cell.lotId));

    const [cfgRow] = await tx
      .select()
      .from(cellGradeConfigTable)
      .where(eq(cellGradeConfigTable.id, 1));

    const cfg = cfgRow ?? {
      gradeAMinCapacityPct: 98,
      gradeAMaxIrMult: 1.05,
      gradeBMinCapacityPct: 95,
      gradeBMaxIrMult: 1.10,
      gradeCMinCapacityPct: 90,
      gradeCMaxIrMult: 1.15,
      nominalIrMohm: 1.0,
    };

    const autoGrade = calcGrade(
      body.capacityAh,
      body.internalResistanceMohm,
      lotRow?.nominalCapacityAh ?? body.capacityAh,
      cfg
    );

    let finalStatus: CellStatus;
    if (body.overrideStatus && body.overrideStatus !== "null") {
      finalStatus = body.overrideStatus as CellStatus;
    } else if (autoGrade === "reject") {
      finalStatus = "rejected";
    } else {
      finalStatus = "approved";
    }

    const finalGrade: CellGrade = autoGrade;

    const [updatedCell] = await tx
      .update(cellsTable)
      .set({
        voltageV: body.voltageV,
        capacityAh: body.capacityAh,
        internalResistanceMohm: body.internalResistanceMohm,
        temperatureC: body.temperatureC ?? null,
        gradingMachineId: body.gradingMachineId ?? null,
        gradedBy,
        gradedAt: new Date(),
        gradingNotes: body.gradingNotes ?? null,
        grade: finalGrade,
        status: finalStatus,
      })
      .where(eq(cellsTable.id, req.params.id))
      .returning();

    // Record the original measurement (engineering version 1) in the platform
    // Engineering Correction Framework ledger (append-only history) so later
    // corrections preserve the full genealogy.
    await EngineeringCorrectionService.recordOriginal(tx, {
      entityType: "CELL",
      entityId: updatedCell.id,
      performedBy: gradedBy,
      auditEventType: "cell_graded",
      newValue: {
        voltageV: body.voltageV,
        capacityAh: body.capacityAh,
        internalResistanceMohm: body.internalResistanceMohm,
        temperatureC: body.temperatureC ?? null,
        gradingMachineId: body.gradingMachineId ?? null,
        grade: finalGrade,
        status: finalStatus,
        overrideStatus: body.overrideStatus && body.overrideStatus !== "null" ? body.overrideStatus : null,
        gradedBy,
        gradingNotes: body.gradingNotes ?? null,
      },
      metadata: { lotId: updatedCell.lotId },
    });

    if (lotRow) {
      let newLotStatus: LotStatus | null = null;

      if (lotRow.status === "received") {
        newLotStatus = "grading";
      } else if (lotRow.status === "grading") {
        const [{ pendingCount }] = await tx
          .select({ pendingCount: count() })
          .from(cellsTable)
          .where(
            and(
              eq(cellsTable.lotId, lotRow.id),
              or(
                eq(cellsTable.status, "received"),
                eq(cellsTable.status, "grading")
              )
            )
          );

        if (Number(pendingCount) === 0) {
          newLotStatus = "graded";
        }
      }

      // Record individual cell grading on the lot timeline
      await tx.insert(cellLotEventsTable).values({
        lotId: lotRow.id,
        eventType: "cell_graded",
        performedBy: gradedBy,
        reason: null,
        changes: {
          cellId: updatedCell.cellId,
          grade: finalGrade,
          status: finalStatus,
          capacityAh: body.capacityAh,
          internalResistanceMohm: body.internalResistanceMohm,
          voltageV: body.voltageV,
        },
      });

      if (newLotStatus) {
        await tx
          .update(cellLotsTable)
          .set({ status: newLotStatus })
          .where(eq(cellLotsTable.id, lotRow.id));

        await tx.insert(cellLotEventsTable).values({
          lotId: lotRow.id,
          eventType: newLotStatus === "grading" ? "grading_started" : "lot_fully_graded",
          performedBy: gradedBy,
          reason: null,
          changes: { status: { from: lotRow.status, to: newLotStatus } },
        });
      }
    }

    return updatedCell;
  });

  res.json(updated);
});

// POST /cells/:id/correct — DEF-CW02-006 controlled correction workflow.
// Supervisor/Director only (operator is blocked even though the router-level
// requireWriteRole lets operator through for writes). The original measurement
// is never mutated; the correction is appended as a new sequence and becomes the
// active grade, with a mandatory reason recorded on the lot audit timeline.
router.post("/:id/correct", requireRole("supervisor", "director"), async (req, res) => {
  const body = CorrectCellBody.parse(req.body);
  // Per-route middleware widens req.params to string|string[] under Express 5's
  // type inference — narrow it once (codebase convention, see masters/common.ts).
  const id = req.params.id as string;

  const correctedBy = body.correctedBy.trim();
  if (correctedBy.length === 0) {
    res.status(400).json({ error: "correctedBy is required and cannot be blank" });
    return;
  }
  const correctionReason = body.correctionReason.trim();
  if (correctionReason.length === 0) {
    res.status(400).json({ error: "correctionReason is required and cannot be blank" });
    return;
  }

  const [cell] = await db
    .select()
    .from(cellsTable)
    .where(eq(cellsTable.id, id));

  if (!cell) {
    res.status(404).json({ error: "Cell not found" });
    return;
  }

  // Only a cell that has already been graded may be corrected. Ungraded cells
  // must use the grade endpoint; cells committed to production (reserved/
  // allocated) must not be re-graded or genealogy of built batteries breaks.
  if (cell.status === "received" || cell.status === "grading") {
    res.status(400).json({ error: `Cell status is '${cell.status}' — it has not been graded yet; use the grade endpoint` });
    return;
  }
  if (cell.status === "reserved" || cell.status === "allocated") {
    res.status(400).json({ error: `Cell status is '${cell.status}' — it is committed to production and cannot be corrected` });
    return;
  }

  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      // Re-read the cell under a row lock INSIDE the transaction. The pre-check
      // above is a fast-fail for UX, but status could flip (e.g. reserved/
      // allocated) between that read and this write — TOCTOU. Locking the row
      // serialises concurrent corrections of the same cell (which also makes the
      // sequence assignment below collision-free) and lets us re-validate the
      // status authoritatively before mutating.
      const [lockedCell] = await tx
        .select()
        .from(cellsTable)
        .where(eq(cellsTable.id, id))
        .for("update");

      if (!lockedCell) {
        throw new CorrectionStateError(404, "Cell not found");
      }
      if (lockedCell.status === "received" || lockedCell.status === "grading") {
        throw new CorrectionStateError(
          400,
          `Cell status is '${lockedCell.status}' — it has not been graded yet; use the grade endpoint`
        );
      }
      if (lockedCell.status === "reserved" || lockedCell.status === "allocated") {
        throw new CorrectionStateError(
          400,
          `Cell status is '${lockedCell.status}' — it is committed to production and cannot be corrected`
        );
      }

      const [lotRow] = await tx
        .select()
        .from(cellLotsTable)
        .where(eq(cellLotsTable.id, lockedCell.lotId));

    const [cfgRow] = await tx
      .select()
      .from(cellGradeConfigTable)
      .where(eq(cellGradeConfigTable.id, 1));

    const cfg = cfgRow ?? {
      gradeAMinCapacityPct: 98,
      gradeAMaxIrMult: 1.05,
      gradeBMinCapacityPct: 95,
      gradeBMaxIrMult: 1.10,
      gradeCMinCapacityPct: 90,
      gradeCMaxIrMult: 1.15,
      nominalIrMohm: 1.0,
    };

    const autoGrade = calcGrade(
      body.capacityAh,
      body.internalResistanceMohm,
      lotRow?.nominalCapacityAh ?? body.capacityAh,
      cfg
    );

    let finalStatus: CellStatus;
    if (body.overrideStatus && body.overrideStatus !== "null") {
      finalStatus = body.overrideStatus as CellStatus;
    } else if (autoGrade === "reject") {
      finalStatus = "rejected";
    } else {
      finalStatus = "approved";
    }

    const finalGrade: CellGrade = autoGrade;

    const [updatedCell] = await tx
      .update(cellsTable)
      .set({
        voltageV: body.voltageV,
        capacityAh: body.capacityAh,
        internalResistanceMohm: body.internalResistanceMohm,
        temperatureC: body.temperatureC ?? null,
        gradingMachineId: body.gradingMachineId ?? null,
        gradedBy: correctedBy,
        gradedAt: new Date(),
        gradingNotes: body.gradingNotes ?? null,
        grade: finalGrade,
        status: finalStatus,
      })
      .where(eq(cellsTable.id, id))
      .returning();

    // Append the correction (next engineering version) to the platform ECF
    // ledger — the original record is left untouched (immutable). ECF assigns the
    // version and a unique Correction ID under the cell row lock held above.
    const correction = await EngineeringCorrectionService.correct(tx, {
      entityType: "CELL",
      entityId: updatedCell.id,
      correctionReason,
      performedBy: correctedBy,
      approvedBy: correctedBy,
      actorRole: req.user?.role,
      allowedRoles: ["supervisor", "director"],
      auditEventType: "cell_grade_corrected",
      previousValue: {
        voltageV: lockedCell.voltageV,
        capacityAh: lockedCell.capacityAh,
        internalResistanceMohm: lockedCell.internalResistanceMohm,
        temperatureC: lockedCell.temperatureC,
        gradingMachineId: lockedCell.gradingMachineId,
        grade: lockedCell.grade,
        status: lockedCell.status,
      },
      newValue: {
        voltageV: body.voltageV,
        capacityAh: body.capacityAh,
        internalResistanceMohm: body.internalResistanceMohm,
        temperatureC: body.temperatureC ?? null,
        gradingMachineId: body.gradingMachineId ?? null,
        grade: finalGrade,
        status: finalStatus,
        overrideStatus: body.overrideStatus && body.overrideStatus !== "null" ? body.overrideStatus : null,
        gradedBy: correctedBy,
        gradingNotes: body.gradingNotes ?? null,
      },
      metadata: { lotId: updatedCell.lotId },
    });

    // Audit the correction on the lot timeline (mandatory reason captured).
    await tx.insert(cellLotEventsTable).values({
      lotId: updatedCell.lotId,
      eventType: "cell_grade_corrected",
      performedBy: correctedBy,
      reason: correctionReason,
      changes: {
        cellId: updatedCell.cellId,
        sequence: correction.sequence,
        correctionId: correction.correctionId,
        grade: { from: lockedCell.grade, to: finalGrade },
        status: { from: lockedCell.status, to: finalStatus },
        capacityAh: body.capacityAh,
        internalResistanceMohm: body.internalResistanceMohm,
        voltageV: body.voltageV,
      },
    });

      return updatedCell;
    });
  } catch (err) {
    if (err instanceof CorrectionStateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof EcfValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof EcfAuthorizationError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }

  res.json(updated);
});

// GET /cells/:id/measurements — full append-only measurement history (genealogy).
router.get("/:id/measurements", async (req, res) => {
  const [cell] = await db
    .select({ id: cellsTable.id })
    .from(cellsTable)
    .where(eq(cellsTable.id, req.params.id));

  if (!cell) {
    res.status(404).json({ error: "Cell not found" });
    return;
  }

  const history = await EngineeringCorrectionService.getHistory(db, "CELL", req.params.id);
  res.json(history.map(toCellMeasurement));
});

export default router;
