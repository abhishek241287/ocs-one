import { Router, type IRouter } from "express";
import assignmentsRouter from "./assignments";
import grnsRouter from "./grns";

// Inventory Platform routes. Each sub-router carries its own RBAC guard and is mounted
// at a distinct path, so guards never shadow one another.
const router: IRouter = Router();

router.use("/material-workflow-assignments", assignmentsRouter);
router.use("/grns", grnsRouter);

export default router;
