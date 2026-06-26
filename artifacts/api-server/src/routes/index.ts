import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productMasterRouter from "./masters/products";
import cellMasterRouter from "./masters/cells";
import bmsMasterRouter from "./masters/bms";
import cabinetMasterRouter from "./masters/cabinets";
import connectorMasterRouter from "./masters/connectors";
import cableMasterRouter from "./masters/cables";
import busbarMasterRouter from "./masters/busbars";
import chargerMasterRouter from "./masters/chargers";
import testEquipmentMasterRouter from "./masters/test-equipment";

const router: IRouter = Router();

router.use(healthRouter);

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

import manufacturingRouter from "./manufacturing/index";
router.use("/manufacturing", manufacturingRouter);

import cellsRouter from "./cells/index";
router.use("/cells", cellsRouter);

export default router;
