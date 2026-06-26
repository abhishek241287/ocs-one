import { Router, IRouter } from "express";
import ordersRouter from "./orders";
import stagesRouter from "./stages";
import timelineRouter from "./timeline";
import genealogyRouter from "./genealogy";

const router: IRouter = Router();

router.use("/orders", ordersRouter);
router.use("/orders/:id/stages", stagesRouter);
router.use("/orders/:id/timeline", timelineRouter);
router.use("/orders/:id/genealogy", genealogyRouter);

export default router;
