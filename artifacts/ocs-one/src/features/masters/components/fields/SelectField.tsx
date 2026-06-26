import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SelectFieldProps {
  label: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  required?: boolean;
  placeholder?: string;
}

export function SelectField({ label, name, value, onChange, options, required, placeholder }: SelectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select value={value} onValueChange={onChange} required={required}>
        <SelectTrigger id={name}>
          <SelectValue placeholder={placeholder || "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
