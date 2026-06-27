import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OdsSearchBar } from "./OdsSearchBar";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface OdsToolbarSearchProps {
  value: string;
  onChange: (v: string) => void;
  onDebouncedChange?: (v: string) => void;
  placeholder?: string;
  captureCtrlF?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

interface OdsToolbarProps {
  /** Search bar config. Omit to hide the search bar. */
  search?: OdsToolbarSearchProps;
  /** Filter controls rendered between search and right-side actions */
  filters?: React.ReactNode;
  /** Action buttons on the right */
  actions?: React.ReactNode;
  /** Show a refresh button next to the search (calls onRefresh) */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export const OdsToolbar = forwardRef<HTMLDivElement, OdsToolbarProps>(
  ({ search, filters, actions, onRefresh, isRefreshing = false, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-wrap items-center gap-2", className)}
      >
        {/* Left: search */}
        {search && (
          <OdsSearchBar
            value={search.value}
            onChange={search.onChange}
            onDebouncedChange={search.onDebouncedChange}
            placeholder={search.placeholder}
            captureCtrlF={search.captureCtrlF}
            className="w-64 flex-shrink-0"
          />
        )}

        {/* Middle: filters */}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: refresh + custom actions */}
        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            title="Refresh"
            className="h-9 w-9"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    );
  }
);
OdsToolbar.displayName = "OdsToolbar";
