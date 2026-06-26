import { Card } from "@/components/ui/card";

interface StatTileProps {
  label: string;
  value: string | number;
}

export function StatTile({ label, value }: StatTileProps) {
  return (
    <Card className="p-4 border-border bg-card shadow-sm flex flex-col justify-center">
      <span className="text-sm text-muted-foreground font-medium mb-1">{label}</span>
      <span className="text-2xl font-bold tracking-tight">{value}</span>
    </Card>
  );
}
