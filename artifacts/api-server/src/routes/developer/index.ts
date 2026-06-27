import { Router, type IRouter } from "express";
import performanceRouter from "./performance";

const router: IRouter = Router();

router.use("/performance", performanceRouter);

export default router;
