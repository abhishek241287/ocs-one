import { ColumnDef } from "@tanstack/react-table";
import type { CertLevel } from "@/components/ods/OdsCertBadge";

export type FieldType = "text" | "number" | "date" | "select" | "boolean" | "textarea";

export type FormState = Record<string, unknown>;

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
  /**
   * Dynamic options computed from the current form state. When present this
   * takes precedence over the static `options` array — used for dependent
   * pickers (e.g. a "Link To" master scoped to the selected category family).
   */
  optionsFn?: (form: FormState) => { label: string; value: string }[];
  /**
   * Conditional visibility. When provided and it returns false the field is not
   * rendered and is excluded from required/validation checks. Used for
   * usage-type-driven fields (e.g. the link picker only for INVENTORY_COMPONENT).
   */
  visibleWhen?: (form: FormState) => boolean;
  /** Small helper text shown under the field. */
  helpText?: string;
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
  /**
   * Optional last-mile transform applied to the form payload before create /
   * update. Used to derive server-required fields from form state (e.g. set
   * `linked_master_type` from the selected category family, null the link for
   * non-component usage types).
   */
  transformSubmit?: (data: FormState) => FormState;
  /**
   * Optional reconciler run after every field change. Lets a master clear or
   * derive dependent fields when one field changes (e.g. clear the link picker
   * when the category — and therefore its component family — changes). Returns
   * the next form state.
   */
  onFieldChange?: (name: string, value: unknown, form: FormState) => FormState;
}
