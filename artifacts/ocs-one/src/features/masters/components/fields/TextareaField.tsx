import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TextareaFieldProps {
  label: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

export function TextareaField({ label, name, value, onChange, required, placeholder }: TextareaFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
