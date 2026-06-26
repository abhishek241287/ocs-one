// API service layer — one file per domain resource.
// Each service wraps apiClient calls and owns the URL paths for its domain.
// Components and hooks should import from here, never call apiClient directly.
//
// Example future service files:
//   ./auth.service.ts   — login, logout, refresh token
//   ./production.service.ts — work orders, batches
//   ./inventory.service.ts  — SKUs, stock movements
//   ./qc.service.ts         — inspections, defects
//   ./dispatch.service.ts   — shipments, orders
//   ./service.service.ts    — support tickets, warranty

export { apiClient } from "./client";
