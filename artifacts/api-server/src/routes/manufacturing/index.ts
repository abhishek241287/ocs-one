import { Router, IRouter } from "express";
import ordersRouter from "./orders";
import stagesRouter from "./stages";
import timelineRouter from "./timeline";
import genealogyRouter from "./genealogy";
import allocatedCellsRouter from "./allocated-cells";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use("/dashboard", dashboardRouter);
router.use("/orders", ordersRouter);
router.use("/orders/:id/stages", stagesRouter);
router.use("/orders/:id/timeline", timelineRouter);
router.use("/orders/:id/genealogy", genealogyRouter);
router.use("/orders/:id/allocated-cells", allocatedCellsRouter);

export default router;
