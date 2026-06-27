import { Router, IRouter } from "express";
import dealersRouter from "./dealers";
import dispatchOrdersRouter from "./dispatch-orders";
import packingDashboardRouter from "./packing-dashboard";

const router: IRouter = Router();

router.use("/dealers", dealersRouter);
router.use("/dispatch-orders", dispatchOrdersRouter);
router.use("/packing-dashboard", packingDashboardRouter);

export default router;
