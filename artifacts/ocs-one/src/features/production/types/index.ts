// Types scoped to the Production feature.

export type WorkOrderStatus = "planned" | "in_progress" | "paused" | "completed" | "cancelled";

export interface WorkOrder {
  id: string;
  batchNumber: string;
  productSku: string;
  quantity: number;
  status: WorkOrderStatus;
  lineId: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ProductionBatch {
  id: string;
  workOrderId: string;
  batchNumber: string;
  totalUnits: number;
  passedUnits: number;
  failedUnits: number;
  status: WorkOrderStatus;
}
