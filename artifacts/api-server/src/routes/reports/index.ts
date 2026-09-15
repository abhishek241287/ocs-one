import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import executiveRouter from "./executive";
import productionRouter from "./production";
import cellsRouter from "./cells";
import qualityRouter from "./quality";
import inventoryRouter from "./inventory";
import logisticsRouter from "./logistics";
import valuationRouter from "./valuation";

const router: IRouter = Router();

// Reports are management views. Keep the read boundary explicit at the parent
// router so every current and future report endpoint inherits the same policy.
router.use(requireRole("director", "supervisor"));
router.use("/executive", executiveRouter);
router.use("/production", productionRouter);
router.use("/cells", cellsRouter);
router.use("/quality", qualityRouter);
router.use("/inventory", inventoryRouter);
router.use("/logistics", logisticsRouter);
router.use("/valuation", valuationRouter);

export default router;
