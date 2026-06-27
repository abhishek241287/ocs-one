import { Router, IRouter } from "express";
import directorRouter from "./director";

const router: IRouter = Router();
router.use("/director", directorRouter);

export default router;
