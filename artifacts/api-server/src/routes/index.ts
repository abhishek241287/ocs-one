import { Router, type IRouter } from "express";
import { requireAuth, denyDealerFactoryAccess } from "../middleware/auth";
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
import unitMasterRouter from "./masters/units";
import materialAttributeMasterRouter from "./masters/material-attributes";
import attributeTemplateMasterRouter from "./masters/attribute-templates";
import materialTemplateMappingRouter, {
  resolveTemplateHandler,
} from "./masters/material-template-mappings";
import materialInventoryProfileRouter from "./masters/material-inventory-profiles";
import inventoryRouter from "./inventory/index";
import productsRouter from "./products/index";
import packingRouter from "./packing/index";
import dispatchRouter from "./dispatch/index";
import dealersRouter from "./dealers/index";
import customersRouter from "./customers/index";
import warrantiesRouter from "./warranties/index";
import bomRouter from "./bom/index";
import manufacturingRouter from "./manufacturing/index";
import cellsRouter from "./cells/index";
import logisticsRouter from "./logistics/index";
import dashboardRouter from "./dashboard/index";
import reportsRouter from "./reports/index";
import developerRouter from "./developer/index";
import procurementRouter from "./procurement/index";
import genealogyRouter from "./genealogy";

const router: IRouter = Router();

// ─── Public routes (no auth required) ────────────────────────────────────────
router.use(healthRouter);
router.use("/auth", authRouter);

// ─── All routes below require a valid session ─────────────────────────────────
router.use(requireAuth);

// Phase 8 genealogy is an authenticated read-only tracing surface. Mount it
// before the factory-role denial so every authenticated role, including viewer,
// can perform the floor-level trace defined by D-gen-1/D-gen-4.
router.use("/genealogy", genealogyRouter);

// Fulfillment — Dealer portal (read-only projection for dealer-role users).
// Mounted BEFORE denyDealerFactoryAccess so dealer accounts can reach their own
// scoped inventory and dispatch-history. The C1 isolation middleware inside
// dealersRouter enforces that a dealer can only access their own dealership.
// Factory roles also pass through unrestricted (they have no dealer restriction).
router.use("/dealers", dealersRouter);

// Dealer is an external portal-only role: deny it access to every factory route
// below (reads included). Auth routes are mounted ABOVE this line so a dealer can
// still log in, read /auth/me, log out, and access /dealers (above).
router.use(denyDealerFactoryAccess);

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
router.use("/masters/units", unitMasterRouter);
router.use("/masters/material-attributes", materialAttributeMasterRouter);
router.use("/masters/attribute-templates", attributeTemplateMasterRouter);
router.use("/masters/material-template-mappings", materialTemplateMappingRouter);
router.use("/masters/material-inventory-profiles", materialInventoryProfileRouter);
router.get("/masters/resolve-template", resolveTemplateHandler);

// Inventory Platform — Goods Receipt Notes + workflow assignment routing
router.use("/inventory", inventoryRouter);

// Procurement — Phase 1 purchase orders
router.use("/procurement/purchase-orders", procurementRouter);

// Unified Product Platform — serialized Products (units)
router.use("/products", productsRouter);

// Fulfillment — Packing (Product-Platform-driven; status + events only)
router.use("/packing", packingRouter);

// Fulfillment — Dispatch (Product-Platform-driven; status + dealer + events only)
router.use("/dispatch", dispatchRouter);

// Customer Registration (G3) — end-customer ownership of a dispatched Product
router.use("/customers", customersRouter);

// Warranty (G4) — common warranty engine (computed status) across all product types
router.use("/warranties", warrantiesRouter);

// MES — Bill of Materials (BOM Master)
router.use("/boms", bomRouter);

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
