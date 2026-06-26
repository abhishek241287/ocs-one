import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateFieldProps {
  label: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function DateField({ label, name, value, onChange, required }: DateFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
