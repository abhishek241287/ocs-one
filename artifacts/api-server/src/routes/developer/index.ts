import { Router, type IRouter } from "express";
import performanceRouter from "./performance";
import securityRouter from "./security";

const router: IRouter = Router();

router.use("/performance", performanceRouter);
router.use("/security", securityRouter);

export default router;
