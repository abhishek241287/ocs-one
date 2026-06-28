import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import productMasterRouter from "./masters/products";
import cellMasterRouter from "./masters/cells";
import bmsMasterRouter from "./masters/bms";
import cabinetMasterRouter from "./masters/cabinets";
import connectorMasterRouter from "./masters/connectors";
import cableMasterRouter from "./masters/cables";
import busbarMasterRouter from "./masters/busbars";
import chargerMasterRouter from "./masters/chargers";
import testEquipmentMasterRouter from "./masters/test-equipment";
import productCategoryMasterRouter from "./masters/product-categories";
import productWorkflowMasterRouter from "./masters/product-workflows";
import materialCategoryMasterRouter from "./masters/material-categories";
import materialMasterRouter from "./masters/materials";
import supplierMasterRouter from "./masters/suppliers";
import materialWorkflowMasterRouter from "./masters/material-workflows";
import inventoryRouter from "./inventory/index";
import productsRouter from "./products/index";
import manufacturingRouter from "./manufacturing/index";
import cellsRouter from "./cells/index";
import logisticsRouter from "./logistics/index";
import dashboardRouter from "./dashboard/index";
import reportsRouter from "./reports/index";
import developerRouter from "./developer/index";

const router: IRouter = Router();

// ─── Public routes (no auth required) ────────────────────────────────────────
router.use(healthRouter);
router.use("/auth", authRouter);

// ─── All routes below require a valid session ─────────────────────────────────
router.use(requireAuth);

// Engineering Masters
router.use("/masters/products", productMasterRouter);
router.use("/masters/cells", cellMasterRouter);
router.use("/masters/bms", bmsMasterRouter);
router.use("/masters/cabinets", cabinetMasterRouter);
router.use("/masters/connectors", connectorMasterRouter);
router.use("/masters/cables", cableMasterRouter);
router.use("/masters/busbars", busbarMasterRouter);
router.use("/masters/chargers", chargerMasterRouter);
router.use("/masters/test-equipment", testEquipmentMasterRouter);
router.use("/masters/product-categories", productCategoryMasterRouter);
router.use("/masters/product-workflows", productWorkflowMasterRouter);
router.use("/masters/material-categories", materialCategoryMasterRouter);
router.use("/masters/materials", materialMasterRouter);
router.use("/masters/suppliers", supplierMasterRouter);
router.use("/masters/material-workflows", materialWorkflowMasterRouter);

// Inventory Platform — Goods Receipt Notes + workflow assignment routing
router.use("/inventory", inventoryRouter);

// Unified Product Platform — serialized Products (units)
router.use("/products", productsRouter);

// Manufacturing
router.use("/manufacturing", manufacturingRouter);

// Cell Lifecycle
router.use("/cells", cellsRouter);

// Logistics
router.use("/logistics", logisticsRouter);

// Director Dashboard
router.use("/dashboard", dashboardRouter);

// Reports
router.use("/reports", reportsRouter);

// Developer / Engineering Health (director-only routes inside)
router.use("/developer", developerRouter);

export default router;
