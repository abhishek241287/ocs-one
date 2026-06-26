import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BooleanFieldProps {
  label: string;
  name: string;
  value?: boolean;
  onChange: (value: boolean) => void;
}

export function BooleanField({ label, name, value, onChange }: BooleanFieldProps) {
  return (
    <div className="flex items-center space-x-2 py-2">
      <Switch
        id={name}
        checked={value || false}
        onCheckedChange={onChange}
      />
      <Label htmlFor={name}>{label}</Label>
    </div>
  );
}
