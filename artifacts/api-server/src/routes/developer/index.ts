import { Router, type IRouter } from "express";
import performanceRouter from "./performance";
import securityRouter from "./security";
import configurationRouter from "./configuration";

const router: IRouter = Router();

router.use("/performance", performanceRouter);
router.use("/security", securityRouter);
router.use("/configuration", configurationRouter);

export default router;
