import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

async function fetchReport<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}api/reports/${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load report: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ExecutiveReport {
  production: { today: number; thisMonth: number; total: number; inProgress: number; draft: number };
  quality: { qcPassPct: number | null; qcRejectPct: number | null; firstPassYield: number | null; reworkPct: number | null; openReworks: number; totalReworks: number };
  timings: { avgMfgHrs: number | null; avgChargingHrs: number | null; avgTestingHrs: number | null };
  inventory: { totalCells: number; availableCells: number; allocatedCells: number; gradeA: number; gradeB: number; gradeC: number; rejected: number; batteriesInProduction: number; readyForDispatch: number };
  logistics: { dispatchedToday: number; inTransit: number; totalShipments: number };
  yieldPct: number | null;
  refreshedAt: string;
}

export interface ProductionReport {
  filters: { from: string; to: string; productId: string | null };
  byDay: { date: string; created: number; completed: number }[];
  byWeek: { week: string; created: number; completed: number }[];
  byMonth: { month: string; created: number; completed: number }[];
  byOperator: { operator: string; completed: number }[];
  stageTimings: { stage: string; avgHrs: number | null; count: number }[];
  refreshedAt: string;
}

export interface CellReport {
  summary: { total: number; gradeA: number; gradeB: number; gradeC: number; rejected: number; gradeAPct: number; gradeBPct: number; gradeCPct: number; rejectedPct: number; avgCapacity: number | null; avgIr: number | null };
  capacityDistribution: { bucket: string; count: number }[];
  irDistribution: { bucket: string; count: number }[];
  bySupplier: { supplier: string; total: number; gradeA: number; gradeB: number; gradeC: number; rejected: number; yieldPct: number; avgCapacity: number | null }[];
  byLot: { lotNumber: string; supplier: string; total: number; gradeA: number; rejected: number; yieldPct: number }[];
  matchingStats: { total: number; allocated: number; pending: number; successPct: number | null };
  refreshedAt: string;
}

export interface QualityReport {
  summary: { totalTests: number; passed: number; failed: number; qcPassPct: number | null; qcRejectPct: number | null; firstPassYield: number | null; qcApprovals: number; qcApproved: number; qcRejected: number; qcApprovalPct: number | null };
  rework: { total: number; open: number; resolved: number };
  byTestType: { testType: string; total: number; passed: number; failed: number; passRate: number | null }[];
  stageRejections: { stage: string; rejected: number }[];
  topDefects: { reason: string; count: number }[];
  refreshedAt: string;
}

export interface InventoryReport {
  cells: { total: number; available: number; allocated: number; inProduction: number; rejected: number; statusBreakdown: { status: string; count: number }[]; gradeBreakdown: { grade: string; count: number }[] };
  batteries: { total: number; inProgress: number; completed: number; readyForDispatch: number; draft: number };
  byLot: { lotNumber: string; supplier: string; receivedAt: string; total: number; available: number; allocated: number; rejected: number; utilizationPct: number }[];
  rawMaterials: { byState: { stock_state: string; total_qty: number; material_count: number }[]; availableQty: number };
  finishedProducts: { total: number; available: number; readyForPacking: number; packed: number; dispatched: number; dealerStock: number; byStatus: { status: string; count: number }[] };
  refreshedAt: string;
}

export interface LogisticsReport {
  summary: { total: number; packedToday: number; dispatchedToday: number; inTransit: number; delivered: number; totalBatteriesShipped: number };
  statusFlow: { status: string; count: number }[];
  byDealer: { dealerName: string; territory: string; total: number; delivered: number; inTransit: number }[];
  byTerritory: { territory: string; total: number; delivered: number }[];
  byMonth: { month: string; total: number; dispatched: number }[];
  refreshedAt: string;
}

export interface ValuationValueOnHandFilters {
  material_id?: string | null;
  warehouse_id?: string | null;
  stock_state?: string | null;
}

export interface ValuationValueOnHandSummary {
  total_quantity: number;
  captured_quantity: number;
  unknown_quantity: number;
  captured_coverage_pct: number | null;
  captured_value_by_currency: { currency: string; value_amount: number | null }[];
  layer_count: number;
  row_count: number;
}

export interface ValuationValueOnHandRow {
  layer_id: string | number;
  grn_line_id: string | number | null;
  material_id: string | number;
  material_code: string | null;
  material_name: string | null;
  warehouse_id: string | number | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  stock_state: string | null;
  quantity: number | null;
  uom: string | null;
  layer_remaining_quantity: number | null;
  value_status: string | null;
  receipt_cost_status: string | null;
  unit_cost: number | null;
  value_amount: number | null;
  currency: string | null;
  policy: string | null;
  receipt_movement_id: string | number | null;
  created_at: string | null;
}

export interface ValuationValueOnHandReport {
  filters: ValuationValueOnHandFilters;
  summary: ValuationValueOnHandSummary;
  rows: ValuationValueOnHandRow[];
  refreshed_at: string;
}

export interface ValuationMovementsAtCostFilters {
  from: string;
  to: string;
  material_id?: string | null;
  movement_id?: string | null;
  limit?: number | null;
}

export interface ValuationMovementsAtCostRow {
  event_id: string | number;
  layer_id: string | number | null;
  movement_id: string | number | null;
  event_at: string | null;
  event_type: string | null;
  transaction_type: string | null;
  material_id: string | number | null;
  material_code: string | null;
  material_name: string | null;
  quantity: number | null;
  value_status: string | null;
  unit_cost: number | null;
  value_amount: number | null;
  currency: string | null;
  policy: string | null;
  allocation_index: number | null;
  warehouse_id: string | number | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  source_document_type: string | null;
  source_document_id: string | number | null;
  source_line_id: string | number | null;
}

export interface ValuationMovementsAtCostReport {
  filters: ValuationMovementsAtCostFilters;
  rows: ValuationMovementsAtCostRow[];
  refreshed_at: string;
}

export interface ValuationLayerTraceFilters {
  from: string;
  to: string;
  movement_id?: string | null;
  material_id?: string | null;
  limit?: number | null;
}

export interface ValuationLayerTraceRow {
  allocation_id: string | number;
  event_at: string | null;
  movement_id: string | number | null;
  allocation_index: number | null;
  direction: string | null;
  quantity: number | null;
  value_status: string | null;
  unit_cost: number | null;
  value_amount: number | null;
  currency: string | null;
  policy: string | null;
  material_id: string | number | null;
  material_code: string | null;
  material_name: string | null;
  source_document_type: string | null;
  source_document_id: string | number | null;
  source_line_id: string | number | null;
  layer_id: string | number | null;
  grn_line_id: string | number | null;
  receipt_movement_id: string | number | null;
  receipt_quantity: number | null;
  layer_remaining_quantity: number | null;
  receipt_cost_status: string | null;
  receipt_unit_cost: number | null;
  receipt_currency: string | null;
  layer_created_at: string | null;
  receipt_document_type: string | null;
  receipt_document_id: string | number | null;
  receipt_line_id: string | number | null;
  receipt_event_at: string | null;
}

export interface ValuationLayerTraceReport {
  filters: ValuationLayerTraceFilters;
  rows: ValuationLayerTraceRow[];
  refreshed_at: string;
}

export function useExecutiveReport() {
  return useQuery({ queryKey: ["reports", "executive"], queryFn: () => fetchReport<ExecutiveReport>("executive"), staleTime: 60_000 });
}

export function useProductionReport(params?: Record<string, string>) {
  return useQuery({ queryKey: ["reports", "production", params], queryFn: () => fetchReport<ProductionReport>("production", params), staleTime: 60_000 });
}

export function useCellReport() {
  return useQuery({ queryKey: ["reports", "cells"], queryFn: () => fetchReport<CellReport>("cells"), staleTime: 60_000 });
}

export function useQualityReport() {
  return useQuery({ queryKey: ["reports", "quality"], queryFn: () => fetchReport<QualityReport>("quality"), staleTime: 60_000 });
}

export function useInventoryReport() {
  return useQuery({ queryKey: ["reports", "inventory"], queryFn: () => fetchReport<InventoryReport>("inventory"), staleTime: 60_000 });
}

export function useLogisticsReport() {
  return useQuery({ queryKey: ["reports", "logistics"], queryFn: () => fetchReport<LogisticsReport>("logistics"), staleTime: 60_000 });
}

function compactParams(params: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params as Record<string, string | number | null | undefined>)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}

export function useValuationValueOnHand(params: ValuationValueOnHandFilters) {
  const queryParams = compactParams(params);
  return useQuery({
    queryKey: ["reports", "valuation", "value-on-hand", queryParams],
    queryFn: () => fetchReport<ValuationValueOnHandReport>("valuation/value-on-hand", queryParams),
    staleTime: 60_000,
  });
}

export function useValuationMovementsAtCost(params: ValuationMovementsAtCostFilters) {
  const queryParams = compactParams(params);
  return useQuery({
    queryKey: ["reports", "valuation", "movements-at-cost", queryParams],
    queryFn: () => fetchReport<ValuationMovementsAtCostReport>("valuation/movements-at-cost", queryParams),
    staleTime: 60_000,
  });
}

export function useValuationLayerTrace(params: ValuationLayerTraceFilters) {
  const queryParams = compactParams(params);
  return useQuery({
    queryKey: ["reports", "valuation", "layer-trace", queryParams],
    queryFn: () => fetchReport<ValuationLayerTraceReport>("valuation/layer-trace", queryParams),
    staleTime: 60_000,
  });
}
