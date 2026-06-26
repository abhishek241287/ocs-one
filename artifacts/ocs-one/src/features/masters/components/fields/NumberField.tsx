import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberFieldProps {
  label: string;
  name: string;
  value?: number;
  onChange: (value: number) => void;
  required?: boolean;
  placeholder?: string;
}

export function NumberField({ label, name, value, onChange, required, placeholder }: NumberFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
