import { Router, type IRouter } from "express";
import assignmentsRouter from "./assignments";
import consumptionRouter from "./consumptions";
import grnsRouter from "./grns";
import inspectionsRouter from "./inspections";
import lotsRouter from "./lots";
import reservationsRouter from "./reservations";
import stockRouter from "./stock";
import transfersRouter, { cellStockRouter } from "./transfers";
import wipIssuesRouter from "./wip-issues";

// Inventory Platform routes. Each sub-router carries its own RBAC guard and is mounted
// at a distinct path, so guards never shadow one another.
const router: IRouter = Router();

router.use("/material-workflow-assignments", assignmentsRouter);
router.use("/consumptions", consumptionRouter);
router.use("/grns", grnsRouter);
router.use("/inspections", inspectionsRouter);
router.use("/lots", lotsRouter);
router.use("/reservations", reservationsRouter);
router.use("/stock", stockRouter);
router.use("/cell-stock", cellStockRouter);
router.use("/transfers", transfersRouter);
router.use("/wip-issues", wipIssuesRouter);

export default router;
