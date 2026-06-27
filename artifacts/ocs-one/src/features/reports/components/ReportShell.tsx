import { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  subtitle?: string;
  refreshedAt?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  children: ReactNode;
}

export function ReportShell({ title, subtitle, refreshedAt, onRefresh, isLoading, children }: Props) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {refreshedAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {new Date(refreshedAt).toLocaleTimeString()}
            </span>
          )}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              <span className="ml-1.5">Refresh</span>
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
