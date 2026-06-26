import { pgTable, text, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterTestEquipmentTable = pgTable("master_test_equipment", {
  ...createMasterCommonColumns("master_test_equipment"),
  equipmentName: text("equipment_name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number").unique().notNull(),
  calibrationDate: date("calibration_date", { mode: "string" }).notNull(),
  nextCalibrationDue: date("next_calibration_due", { mode: "string" }).notNull(),
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
