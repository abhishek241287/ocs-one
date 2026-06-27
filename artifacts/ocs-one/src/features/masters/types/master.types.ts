import { ColumnDef } from "@tanstack/react-table";
import type { CertLevel } from "@/components/ods/OdsCertBadge";

export type FieldType = "text" | "number" | "date" | "select" | "boolean" | "textarea";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
}

export interface MasterConfig<T> {
  resource: string;
  title: string;
  description: string;
  /** ODS Standard 3 — one emoji icon per concept */
  icon?: string;
  /** ODS Standard 14 — certification badge level */
  certification?: CertLevel;
  columns: ColumnDef<T>[];
  fields: FieldConfig[];
}
