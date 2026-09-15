import { useQuery } from "@tanstack/react-query";

export interface PipelineStage {
  key: string;
  label: string;
  href: string;
  inProgress: number;
  waiting: number;
  blocked: number;
  completedToday: number;
  health: "green" | "yellow" | "red";
}

export interface DashboardAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;
}

export interface DirectorDashboardData {
  refreshedAt: string;
  kpis: {
    todayTarget: number;
    todayCompleted: number;
    productionEfficiency: number;
    inProgress: number;
    qcPending: number;
    dispatchReady: number;
    reworkQueue: number;
    chargerUtilization: number;
  };
  pipeline: PipelineStage[];
  alerts: DashboardAlert[];
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    batteryNumber: string;
    status: string;
    currentStage: string | null;
    priority: string;
    productName?: string | null;
    productSku?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  operatorActivity: Array<{
    operatorName: string | null;
    stage: string | null;
    lastActivity: string;
    batteriesCompletedToday: number;
  }>;
  equipmentStatus: {
    chargers: { total: number; available: number; busy: number; maintenance: number };
    testEquipment: { total: number; available: number; busy: number; maintenance: number };
  };
  qualitySummary: {
    passRate: number;
    rejectRate: number;
    testPassCount: number;
    testFailCount: number;
    sampleCount: number;
  };
  logistics: {
    readyForDispatch: number;
    inTransit: number;
    deliveredToday: number;
    totalDealers: number;
  };
  cellInventory: {
    total: number;
    received: number;
    grading: number;
    approved: number;
    reserved: number;
    allocated: number;
    rejected: number;
    quarantine: number;
  };
  orderStats: {
    total: number;
    inProgress: number;
    completed: number;
    draft: number;
  };
}

async function fetchDirectorDashboard(): Promise<DirectorDashboardData> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/dashboard/director`);
  if (!res.ok) throw new Error("Failed to load director dashboard");
  return res.json();
}

export function useDirectorDashboard() {
  return useQuery({
    queryKey: ["director-dashboard"],
    queryFn: fetchDirectorDashboard,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
