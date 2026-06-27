import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number | null;
  sub?: string;
  icon?: ReactNode;
  accent?: string;
  loading?: boolean;
  suffix?: string;
  href?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, icon, accent, loading, suffix, onClick }: Props) {
  return (
    <Card
      className={cn("relative overflow-hidden", onClick && "cursor-pointer hover:shadow-md transition-shadow")}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            {loading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className="text-3xl font-black tracking-tight">
                {value ?? "—"}{suffix && <span className="text-lg font-semibold text-muted-foreground ml-1">{suffix}</span>}
              </p>
            )}
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          {icon && (
            <div className={cn("p-2.5 rounded-xl shrink-0", accent ?? "bg-muted/50")}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
