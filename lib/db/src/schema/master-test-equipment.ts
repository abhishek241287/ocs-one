import { pgTable, text, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const testEquipmentTypeEnum = pgEnum("test_equipment_type", [
  "capacity_tester",
  "dc_load",
  "protection_tester",
  "internal_resistance_meter",
  "thermal_camera",
  "other",
]);

export const testEquipmentFloorStatusEnum = pgEnum("test_equipment_floor_status", [
  "available",
  "busy",
  "maintenance",
]);

export const masterTestEquipmentTable = pgTable("master_test_equipment", {
  ...createMasterCommonColumns("master_test_equipment"),
  equipmentType: testEquipmentTypeEnum("equipment_type").notNull().default("other"),
  equipmentName: text("equipment_name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number").unique().notNull(),
  calibrationDate: date("calibration_date", { mode: "string" }).notNull(),
  nextCalibrationDue: date("next_calibration_due", { mode: "string" }).notNull(),
  floorStatus: testEquipmentFloorStatusEnum("floor_status").notNull().default("available"),
  softwareVersion: text("software_version"),
  location: text("location"),
});

export const insertTestEquipmentMasterSchema = createInsertSchema(masterTestEquipmentTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertTestEquipmentMaster = z.infer<typeof insertTestEquipmentMasterSchema>;
export type TestEquipmentMaster = typeof masterTestEquipmentTable.$inferSelect;
