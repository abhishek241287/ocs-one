import { useState, useEffect, useRef, type ReactNode } from "react";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import { AlertCircle } from "lucide-react";
import { FieldConfig } from "../types/master.types";
import { TextField } from "./fields/TextField";
import { NumberField } from "./fields/NumberField";
import { DateField } from "./fields/DateField";
import { SelectField } from "./fields/SelectField";
import { BooleanField } from "./fields/BooleanField";
import { TextareaField } from "./fields/TextareaField";
import { OdsDrawer } from "@/components/ods/OdsDrawer";

interface MasterEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  initialData?: Record<string, unknown> | null;
  fields: FieldConfig[];
  title: string;
  /** Optional reconciler: derive/clear dependent fields after a field change. */
  reconcile?: (name: string, value: unknown, form: Record<string, unknown>) => Record<string, unknown>;
}

function isValueEmpty(field: FieldConfig, value: unknown): boolean {
  if (field.type === "boolean") return false;
  if (field.type === "number") return value === undefined || value === null || value === "";
  return !value || String(value).trim() === "";
}

function validateField(field: FieldConfig, value: unknown): string {
  if (!field.required) return "";
  return isValueEmpty(field, value) ? `${field.label} is required` : "";
}

function friendlyApiError(err: unknown): string {
  // Prefer the structured server message (problem+json body) when present.
  const data = (err as { data?: unknown })?.data;
  const serverMsg =
    (data && typeof data === "object"
      ? ((data as Record<string, unknown>).message as string) ||
        ((data as Record<string, unknown>).detail as string) ||
        ((data as Record<string, unknown>).error as string)
      : undefined) || "";

  const rawMsg = String((err as { message?: string })?.message || err || "");
  // ApiError messages look like "HTTP 409 Conflict: <server message>" — strip the prefix.
  const stripped = rawMsg.replace(/^HTTP\s+\d+\s+[^:]*:\s*/i, "").trim();
  const msg = (serverMsg || stripped || rawMsg).trim();
  const lower = msg.toLowerCase();

  if (lower.includes("network") || lower.includes("failed to fetch"))
    return "Network error. Please check your connection and try again.";
  // Surface meaningful server messages verbatim (link locked, wrong family,
  // already linked to an active material, mandatory reason, etc.).
  if (msg && !/^http\s+\d+/i.test(msg)) return msg;
  return "Failed to save. Please try again.";
}

export function MasterEditDrawer({
  isOpen,
  onClose,
  onSave,
  initialData,
  fields,
  title,
  reconcile,
}: MasterEditDrawerProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData ?? {});
      setErrors({});
      setTouched({});
      setSubmitAttempted(false);
      setSaveError("");
    }
  }, [initialData, isOpen]);

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      return reconcile ? reconcile(name, value, next) : next;
    });
    if (touched[name] || submitAttempted) {
      const field = fields.find((f) => f.name === name);
      if (field) setErrors((prev) => ({ ...prev, [name]: validateField(field, value) }));
    }
  };

  const handleBlur = (field: FieldConfig) => {
    setTouched((prev) => ({ ...prev, [field.name]: true }));
    setErrors((prev) => ({
      ...prev,
      [field.name]: validateField(field, formData[field.name]),
    }));
  };

  const isFieldVisible = (field: FieldConfig) =>
    !field.visibleWhen || field.visibleWhen(formData);
  const visibleFields = fields.filter(isFieldVisible);

  const validateAll = (): Record<string, string> => {
    const next: Record<string, string> = {};
    visibleFields.forEach((field) => {
      const err = validateField(field, formData[field.name]);
      if (err) next[field.name] = err;
    });
    return next;
  };

  const handleSubmit = async () => {
    setSaveError("");
    setSubmitAttempted(true);
    const allErrors = validateAll();
    setErrors(allErrors);
    const errorNames = Object.keys(allErrors);
    if (errorNames.length > 0) {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => document.getElementById(errorNames[0])?.focus(), 100);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setSaveError(friendlyApiError(err));
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setIsSaving(false);
    }
  };

  const requiredFields = visibleFields.filter((f) => f.required);
  const isSaveDisabled =
    isSaving || requiredFields.some((f) => isValueEmpty(f, formData[f.name]));

  const errorSummaryFields = submitAttempted ? visibleFields.filter((f) => errors[f.name]) : [];
  const hasErrors = errorSummaryFields.length > 0;

  const renderField = (field: FieldConfig) => {
    const showError = touched[field.name] || submitAttempted;
    const error = showError ? (errors[field.name] ?? "") : "";
    const common = {
      label: field.label,
      name: field.name,
      value: formData[field.name] as never,
      onChange: (val: unknown) => handleChange(field.name, val),
      onBlur: () => handleBlur(field),
      required: field.required,
      placeholder: field.placeholder,
      error,
    };
    let inner: ReactNode;
    switch (field.type) {
      case "number":
        inner = <NumberField {...common} onChange={(v) => handleChange(field.name, v)} />;
        break;
      case "date":
        inner = <DateField {...common} onChange={(v) => handleChange(field.name, v)} />;
        break;
      case "select":
        inner = (
          <SelectField
            {...common}
            onChange={(v) => handleChange(field.name, v)}
            options={field.optionsFn ? field.optionsFn(formData) : (field.options ?? [])}
          />
        );
        break;
      case "boolean":
        inner = (
          <BooleanField
            label={field.label}
            name={field.name}
            value={formData[field.name] as boolean}
            onChange={(v) => handleChange(field.name, v)}
          />
        );
        break;
      case "textarea":
        inner = <TextareaField {...common} onChange={(v) => handleChange(field.name, v)} />;
        break;
      default:
        inner = <TextField {...common} onChange={(v) => handleChange(field.name, v)} />;
    }
    if (!field.helpText) return <div key={field.name}>{inner}</div>;
    return (
      <div key={field.name} className="space-y-1">
        {inner}
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      </div>
    );
  };

  return (
    <OdsDrawer
      open={isOpen}
      onClose={onClose}
      title={initialData ? `Edit ${title}` : `Add ${title}`}
      description={`${initialData ? "Update the" : "Fill in the"} details below. Required fields are marked *.`}
      onSave={handleSubmit}
      isSaving={isSaving}
      isSaveDisabled={isSaveDisabled}
    >
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
        <div ref={summaryRef} className="space-y-4">
          {(hasErrors || saveError) && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveError ? "Could not save" : "Please fix the following errors"}
              </div>
              {saveError && <p className="text-xs text-red-600 pl-6">{saveError}</p>}
              {hasErrors && (
                <ul className="text-xs text-red-600 pl-6 list-disc space-y-0.5">
                  {errorSummaryFields.map((f) => (
                    <li key={f.name}>
                      <button
                        type="button"
                        className="underline hover:no-underline text-left"
                        onClick={() => document.getElementById(f.name)?.focus()}
                      >
                        {errors[f.name]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {visibleFields.map(renderField)}
        </div>
      </form>
    </OdsDrawer>
  );
}
