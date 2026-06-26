// Types scoped to the Dispatch feature.

export type DispatchStatus = "pending" | "packed" | "in_transit" | "delivered" | "returned";

export interface DispatchOrder {
  id: string;
  orderId: string;
  customerId: string;
  items: DispatchItem[];
  status: DispatchStatus;
  carrier?: string;
  trackingNumber?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  destinationAddress: string;
}

export interface DispatchItem {
  inventoryItemId: string;
  sku: string;
  quantity: number;
  serialNumbers: string[]; // QR-linked serials
}
