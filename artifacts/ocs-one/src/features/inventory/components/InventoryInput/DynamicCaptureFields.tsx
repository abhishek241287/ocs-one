import { useEffect } from "react";
import type {
  AttributeTemplatePreview,
  AttributeTemplatePreviewField,
  CanonicalAttributeValue,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  captureValueMap,
  defaultCaptureValues,
  type CaptureValues,
} from "./types";

type Props = {
  preview?: AttributeTemplatePreview;
  values: CaptureValues;
  onChange: (values: CaptureValues) => void;
  disabled?: boolean;
};

function fieldInputType(field: AttributeTemplatePreviewField) {
  if (field.data_type === "DATE") return "date";
  if (field.data_type === "DATETIME") return "datetime-local";
  if (field.data_type === "DECIMAL" || field.data_type === "INTEGER") return "number";
  return "text";
}

export default function DynamicCaptureFields({
  preview,
  values,
  onChange,
  disabled = false,
}: Props) {
  useEffect(() => {
    if (values.length === 0 && preview?.fields.length) {
      const defaults = defaultCaptureValues(preview);
      if (defaults.length) onChange(defaults);
    }
  }, [onChange, preview, values.length]);

  if (!preview) {
    return (
      <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
        Select a material with an active capture template to show its fields.
      </div>
    );
  }

  const byCode = captureValueMap(values);
  const update = (field: AttributeTemplatePreviewField, raw: unknown) => {
    const next: CanonicalAttributeValue = {
      attribute_code: field.attribute_code,
      raw,
      value: raw === "" ? null : raw,
      supplied_unit: field.unit ?? null,
    };
    const withoutCurrent = values.filter(
      (value) => value.attribute_code !== field.attribute_code,
    );
    onChange([...withoutCurrent, next]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Capture attributes
          </p>
          <p className="text-xs text-muted-foreground">
            {preview.template_code} · version {preview.version_no}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {preview.fields.length} server-defined field{preview.fields.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {preview.fields.map((field) => {
          const current = byCode.get(field.attribute_code);
          const value = current?.value ?? current?.raw ?? "";
          const label = `${field.name}${field.required ? " *" : ""}`;
          const help = [
            field.unit,
            field.min !== null && field.min !== undefined ? `min ${field.min}` : "",
            field.max !== null && field.max !== undefined ? `max ${field.max}` : "",
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div key={field.attribute_code} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              {field.data_type === "DROPDOWN" && field.allowed_values?.length ? (
                <Select
                  value={value === null || value === undefined ? "" : String(value)}
                  onValueChange={(next) => update(field, next)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select value…" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.allowed_values.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.data_type === "BOOLEAN" ? (
                <Select
                  value={value === true ? "true" : value === false ? "false" : ""}
                  onValueChange={(next) => update(field, next === "true")}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select true or false…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={fieldInputType(field)}
                  value={value === null || value === undefined ? "" : String(value)}
                  min={field.min ?? undefined}
                  max={field.max ?? undefined}
                  step={field.data_type === "INTEGER" ? 1 : "any"}
                  onChange={(event) =>
                    update(
                      field,
                      field.data_type === "INTEGER"
                        ? event.target.value === ""
                          ? ""
                          : Number(event.target.value)
                        : field.data_type === "DECIMAL"
                          ? event.target.value === ""
                            ? ""
                            : Number(event.target.value)
                          : event.target.value,
                    )
                  }
                  disabled={disabled}
                />
              )}
              {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}