// Types scoped to the Inventory feature.

export type StockMovementType = "receipt" | "issue" | "transfer" | "adjustment" | "scrap";

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  location: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  referenceId?: string; // work order or dispatch ID
  performedBy: string;
  performedAt: string;
  notes?: string;
}
