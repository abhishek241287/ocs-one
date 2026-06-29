import { Router, type IRouter } from "express";
import assignmentsRouter from "./assignments";
import grnsRouter from "./grns";
import inspectionsRouter from "./inspections";
import stockRouter from "./stock";
import transfersRouter, { cellStockRouter } from "./transfers";

// Inventory Platform routes. Each sub-router carries its own RBAC guard and is mounted
// at a distinct path, so guards never shadow one another.
const router: IRouter = Router();

router.use("/material-workflow-assignments", assignmentsRouter);
router.use("/grns", grnsRouter);
router.use("/inspections", inspectionsRouter);
router.use("/stock", stockRouter);
router.use("/cell-stock", cellStockRouter);
router.use("/transfers", transfersRouter);

export default router;
