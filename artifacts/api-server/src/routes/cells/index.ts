import { Router, type IRouter } from "express";
import configRouter from "./config";
import inventoryRouter from "./inventory";
import lotsRouter from "./lots";
import matchesRouter from "./matches";
import reportsRouter from "./reports";
import cellsRouter from "./cells";

const router: IRouter = Router();

// Fixed paths must be registered before /:id param routes
router.use("/config", configRouter);
router.use("/inventory", inventoryRouter);
router.use("/lots", lotsRouter);
router.use("/matches", matchesRouter);
router.use("/reports", reportsRouter);

// Cells (handles /, /:id, /:id/grade)
router.use("/", cellsRouter);

export default router;
