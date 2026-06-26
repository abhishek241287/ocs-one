import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
  onSave: (data: any) => Promise<void>;
  initialData?: any;
  fields: FieldConfig[];
  title: string;
}

export function MasterEditDrawer({
  isOpen,
  onClose,
  onSave,
  initialData,
  fields,
  title,
}: MasterEditDrawerProps) {
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({});
    }
  }, [initialData, isOpen]);

  const handleChange = (name: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: FieldConfig) => {
    const common = {
      key: field.name,
      label: field.label,
      name: field.name,
      value: formData[field.name],
      onChange: (val: any) => handleChange(field.name, val),
      required: field.required,
      placeholder: field.placeholder,
    };

    switch (field.type) {
      case "number":
        return <NumberField {...common} />;
      case "date":
        return <DateField {...common} />;
      case "select":
        return <SelectField {...common} options={field.options || []} />;
      case "boolean":
        return <BooleanField {...common} />;
      case "textarea":
        return <TextareaField {...common} />;
      default:
        return <TextField {...common} />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initialData ? `Edit ${title}` : `Add ${title}`}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {fields.map(renderField)}
          <SheetFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
