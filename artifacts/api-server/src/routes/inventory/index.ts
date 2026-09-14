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
import wipInventoryRouter from "./wip-inventory";
import returnsRouter from "./returns";
import scrapRouter from "./scrap";
import adjustmentsRouter from "./adjustments";
import transferRequestsRouter from "./transfer-requests";
import importsRouter from "./imports";
import scanSessionsRouter from "./scan-sessions";

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
router.use("/wip-inventory", wipInventoryRouter);
router.use("/returns", returnsRouter);
router.use("/scrap", scrapRouter);
router.use("/adjustments", adjustmentsRouter);
router.use("/transfer-requests", transferRequestsRouter);
router.use("/imports", importsRouter);
router.use("/scan-sessions", scanSessionsRouter);

export default router;
