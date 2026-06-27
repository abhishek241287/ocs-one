import { Router, IRouter } from "express";
import { db, cellsTable, cellLotsTable, cellGradeConfigTable, cellLotEventsTable, mfgProductionOrdersTable, mfgBatteryGenealogyTable } from "@workspace/db";
import { eq, ilike, and, or, desc, count } from "drizzle-orm";
import { ListCellsQueryParams, GradeCellBody } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

type CellStatus = typeof cellsTable.status._.data;
type CellGrade = typeof cellsTable.grade._.data;
type LotStatus = typeof cellLotsTable.status._.data;

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
        gradedBy: body.gradedBy,
        gradedAt: new Date(),
        gradingNotes: body.gradingNotes ?? null,
        grade: finalGrade,
        status: finalStatus,
      })
      .where(eq(cellsTable.id, req.params.id))
      .returning();

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
        performedBy: body.gradedBy,
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
          performedBy: body.gradedBy,
          reason: null,
          changes: { status: { from: lotRow.status, to: newLotStatus } },
        });
      }
    }

    return updatedCell;
  });

  res.json(updated);
});

export default router;
