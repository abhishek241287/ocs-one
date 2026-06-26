import { ColumnDef } from "@tanstack/react-table";

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
  columns: ColumnDef<T>[];
  fields: FieldConfig[];
}
