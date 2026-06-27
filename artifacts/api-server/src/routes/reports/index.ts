import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import executiveRouter from "./executive";
import productionRouter from "./production";
import cellsRouter from "./cells";
import qualityRouter from "./quality";
import inventoryRouter from "./inventory";
import logisticsRouter from "./logistics";

const router: IRouter = Router();

router.use(requireRole("director", "supervisor"));

router.use("/executive", executiveRouter);
router.use("/production", productionRouter);
router.use("/cells", cellsRouter);
router.use("/quality", qualityRouter);
router.use("/inventory", inventoryRouter);
router.use("/logistics", logisticsRouter);

export default router;
