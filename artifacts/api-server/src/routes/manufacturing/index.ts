import { Router, IRouter } from "express";
import ordersRouter from "./orders";
import stagesRouter from "./stages";
import timelineRouter from "./timeline";
import genealogyRouter from "./genealogy";
import allocatedCellsRouter from "./allocated-cells";
import dashboardRouter from "./dashboard";
import chargerUnitsRouter from "./charger-units";
import formationReportRouter from "./formation-report";

const router: IRouter = Router();

router.use("/dashboard", dashboardRouter);
router.use("/charger-units", chargerUnitsRouter);
router.use("/orders", ordersRouter);
router.use("/orders/:id/stages", stagesRouter);
router.use("/orders/:id/timeline", timelineRouter);
router.use("/orders/:id/genealogy", genealogyRouter);
router.use("/orders/:id/allocated-cells", allocatedCellsRouter);
router.use("/orders/:id/formation-report", formationReportRouter);

export default router;
