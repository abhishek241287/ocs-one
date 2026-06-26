// React Query cache key factories.
// Centralising keys prevents typos and makes cache invalidation predictable.
// Pattern: [scope, resource, ...params]

export const QUERY_KEYS = {
  // Dashboard
  dashboardStats: () => ["dashboard", "stats"] as const,
  recentActivity: () => ["dashboard", "activity"] as const,

  // Production
  workOrders: (filters?: object) => ["production", "work-orders", filters] as const,
  batch: (batchId: string) => ["production", "batches", batchId] as const,

  // Inventory
  inventoryItems: (filters?: object) => ["inventory", "items", filters] as const,
  stockMovements: (itemId: string) => ["inventory", "movements", itemId] as const,

  // QC
  inspections: (filters?: object) => ["qc", "inspections", filters] as const,

  // Dispatch
  dispatchOrders: (filters?: object) => ["dispatch", "orders", filters] as const,

  // Service
  serviceTickets: (filters?: object) => ["service", "tickets", filters] as const,
} as const;
