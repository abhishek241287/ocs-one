// Single source of UI labels/options for the generic polymorphic material→master
// link. Mirrors the backend `linked_master_type` + `material_usage_type` enums.

export type LinkedMasterFamily =
  | "CELL"
  | "BMS"
  | "CABLE"
  | "BUSBAR"
  | "CONNECTOR"
  | "CHARGER"
  | "CABINET";

export type MaterialUsage =
  | "INVENTORY_COMPONENT"
  | "CONSUMABLE"
  | "PACKAGING"
  | "SERVICE_ITEM";

export const FAMILY_LABELS: Record<string, string> = {
  CELL: "Cell",
  BMS: "BMS",
  CABLE: "Cable",
  BUSBAR: "Busbar",
  CONNECTOR: "Connector",
  CHARGER: "Charger",
  CABINET: "Cabinet",
};

export const FAMILY_OPTIONS: { label: string; value: string }[] = (
  ["CELL", "BMS", "CABLE", "BUSBAR", "CONNECTOR", "CHARGER", "CABINET"] as LinkedMasterFamily[]
).map((f) => ({ label: FAMILY_LABELS[f], value: f }));

export const USAGE_LABELS: Record<string, string> = {
  INVENTORY_COMPONENT: "Inventory Component",
  CONSUMABLE: "Consumable",
  PACKAGING: "Packaging",
  SERVICE_ITEM: "Service Item",
};

export const USAGE_TYPE_OPTIONS: { label: string; value: string }[] = (
  ["INVENTORY_COMPONENT", "CONSUMABLE", "PACKAGING", "SERVICE_ITEM"] as MaterialUsage[]
).map((u) => ({ label: USAGE_LABELS[u], value: u }));
