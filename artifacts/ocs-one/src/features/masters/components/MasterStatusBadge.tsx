import { OdsStatusBadge } from "@/components/ods";

interface MasterStatusBadgeProps {
  status: "active" | "inactive";
}

export function MasterStatusBadge({ status }: MasterStatusBadgeProps) {
  return <OdsStatusBadge status={status} />;
}
