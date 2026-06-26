// Types scoped to the Quality Control feature.

export type QcResult = "pass" | "fail" | "conditional_pass" | "pending";

export interface QcInspection {
  id: string;
  batchId: string;
  unitSerial: string;
  inspectorId: string;
  result: QcResult;
  defects: QcDefect[];
  notes?: string;
  inspectedAt: string;
}

export interface QcDefect {
  code: string;
  description: string;
  severity: "critical" | "major" | "minor";
  imageUrl?: string;
}

export interface QcCheckpoint {
  id: string;
  name: string;
  productCategory: string;
  checks: string[];
}
