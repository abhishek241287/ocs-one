import { Badge } from "@/components/ui/badge";

interface MasterStatusBadgeProps {
  status: "active" | "inactive";
}

export function MasterStatusBadge({ status }: MasterStatusBadgeProps) {
  const variant = status === "active" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}
