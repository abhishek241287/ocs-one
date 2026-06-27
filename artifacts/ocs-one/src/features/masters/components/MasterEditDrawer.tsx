import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { FieldConfig } from "../types/master.types";
import { TextField } from "./fields/TextField";
import { NumberField } from "./fields/NumberField";
import { DateField } from "./fields/DateField";
import { SelectField } from "./fields/SelectField";
import { BooleanField } from "./fields/BooleanField";
import { TextareaField } from "./fields/TextareaField";

interface MasterEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  initialData?: Record<string, unknown> | null;
  fields: FieldConfig[];
  title: string;
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
  const msg = String((err as { message?: string })?.message || err || "");
  if (msg.toLowerCase().includes("already exists") || msg.includes("409")) {
    return "A record with this code already exists. Please use a unique code.";
  }
  if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return "Failed to save. Please try again.";
}

export function MasterEditDrawer({
  isOpen,
  onClose,
  onSave,
  initialData,
  fields,
  title,
}: MasterEditDrawerProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);

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
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (touched[name] || submitAttempted) {
      const field = fields.find((f) => f.name === name);
      if (field) {
        setErrors((prev) => ({ ...prev, [name]: validateField(field, value) }));
      }
    }
  };

  const handleBlur = (field: FieldConfig) => {
    setTouched((prev) => ({ ...prev, [field.name]: true }));
    setErrors((prev) => ({
      ...prev,
      [field.name]: validateField(field, formData[field.name]),
    }));
  };

  const validateAll = (): Record<string, string> => {
    const next: Record<string, string> = {};
    fields.forEach((field) => {
      const err = validateField(field, formData[field.name]);
      if (err) next[field.name] = err;
    });
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const requiredFields = fields.filter((f) => f.required);
  const isSaveDisabled =
    isSaving ||
    requiredFields.some((f) => isValueEmpty(f, formData[f.name]));

  const errorSummaryFields = submitAttempted
    ? fields.filter((f) => errors[f.name])
    : [];
  const hasErrors = errorSummaryFields.length > 0;

  const renderField = (field: FieldConfig) => {
    const showError = touched[field.name] || submitAttempted;
    const error = showError ? (errors[field.name] ?? "") : "";

    const common = {
      key: field.name,
      label: field.label,
      name: field.name,
      value: formData[field.name] as never,
      onChange: (val: unknown) => handleChange(field.name, val),
      onBlur: () => handleBlur(field),
      required: field.required,
      placeholder: field.placeholder,
      error,
    };

    switch (field.type) {
      case "number":
        return <NumberField {...common} onChange={(v) => handleChange(field.name, v)} />;
      case "date":
        return <DateField {...common} onChange={(v) => handleChange(field.name, v)} />;
      case "select":
        return (
          <SelectField
            {...common}
            onChange={(v) => handleChange(field.name, v)}
            options={field.options ?? []}
          />
        );
      case "boolean":
        return (
          <BooleanField
            key={field.name}
            label={field.label}
            name={field.name}
            value={formData[field.name] as boolean}
            onChange={(v) => handleChange(field.name, v)}
          />
        );
      case "textarea":
        return <TextareaField {...common} onChange={(v) => handleChange(field.name, v)} />;
      default:
        return <TextField {...common} onChange={(v) => handleChange(field.name, v)} />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initialData ? `Edit ${title}` : `Add ${title}`}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div ref={summaryRef} className="pt-4 space-y-4">
            {(hasErrors || saveError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {saveError ? "Could not save" : "Please fix the following errors"}
                </div>
                {saveError && (
                  <p className="text-xs text-red-600 pl-6">{saveError}</p>
                )}
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

            {fields.map(renderField)}
          </div>

          <SheetFooter className="pt-6 pb-2">
            <p className="text-xs text-muted-foreground mr-auto">
              <span className="text-red-500">*</span> Required fields
            </p>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaveDisabled}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
