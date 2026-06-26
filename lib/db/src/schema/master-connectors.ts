import { pgTable, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterConnectorsTable = pgTable("master_connectors", {
  ...createMasterCommonColumns("master_connectors"),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  currentRatingA: decimal("current_rating_a").notNull(),
  voltageRatingV: decimal("voltage_rating_v").notNull(),
  connectorType: text("connector_type").notNull(),
  datasheetUrl: text("datasheet_url"),
});

export const insertConnectorMasterSchema = createInsertSchema(masterConnectorsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertConnectorMaster = z.infer<typeof insertConnectorMasterSchema>;
export type ConnectorMaster = typeof masterConnectorsTable.$inferSelect;
