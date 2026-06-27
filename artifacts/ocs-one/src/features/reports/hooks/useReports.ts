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
