import { Router, type IRouter } from "express";
import executiveRouter from "./executive";
import productionRouter from "./production";
import cellsRouter from "./cells";
import qualityRouter from "./quality";
import inventoryRouter from "./inventory";
import logisticsRouter from "./logistics";
import valuationRouter from "./valuation";

const router: IRouter = Router();

router.use("/executive", executiveRouter);
router.use("/production", productionRouter);
router.use("/cells", cellsRouter);
router.use("/quality", qualityRouter);
router.use("/inventory", inventoryRouter);
router.use("/logistics", logisticsRouter);
router.use("/valuation", valuationRouter);

export default router;
