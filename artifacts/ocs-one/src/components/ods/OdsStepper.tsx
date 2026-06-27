import { Check, X, Lock, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "completed" | "active" | "pending" | "locked" | "rejected";

export interface OdsStep {
  id: string;
  label: string;
  description?: string;
  status: StepStatus;
  timestamp?: string | Date;
  user?: string;
  icon?: React.ReactNode;
}

export interface OdsStepperProps {
  steps: OdsStep[];
  orientation?: "vertical" | "horizontal";
  /** ID of the currently selected step — adds a highlight ring */
  selectedId?: string;
  /** Called when the user clicks a step */
  onStepClick?: (stepId: string) => void;
  className?: string;
}

const STATUS_CONFIG: Record<
  StepStatus,
  {
    dotBg: string;
    dotText: string;
    dotBorder: string;
    label: string;
    labelColor: string;
    connectorColor: string;
  }
> = {
  completed: {
    dotBg:         "bg-green-500",
    dotText:       "text-white",
    dotBorder:     "border-green-500",
    label:         "Completed",
    labelColor:    "text-green-700",
    connectorColor:"bg-green-300",
  },
  active: {
    dotBg:         "bg-primary",
    dotText:       "text-primary-foreground",
    dotBorder:     "border-primary",
    label:         "In Progress",
    labelColor:    "text-primary",
    connectorColor:"bg-slate-200",
  },
  pending: {
    dotBg:         "bg-white",
    dotText:       "text-slate-400",
    dotBorder:     "border-slate-300",
    label:         "Pending",
    labelColor:    "text-slate-400",
    connectorColor:"bg-slate-200",
  },
  locked: {
    dotBg:         "bg-slate-100",
    dotText:       "text-slate-400",
    dotBorder:     "border-slate-200",
    label:         "Locked",
    labelColor:    "text-slate-400",
    connectorColor:"bg-slate-100",
  },
  rejected: {
    dotBg:         "bg-red-500",
    dotText:       "text-white",
    dotBorder:     "border-red-500",
    label:         "Rejected",
    labelColor:    "text-red-600",
    connectorColor:"bg-red-200",
  },
};

function StepDot({ step, selected }: { step: OdsStep; selected: boolean }) {
  const cfg = STATUS_CONFIG[step.status];
  const icon = (() => {
    if (step.icon) return <span className="text-sm">{step.icon}</span>;
    switch (step.status) {
      case "completed": return <Check className="h-3.5 w-3.5" strokeWidth={2.5} />;
      case "rejected":  return <X className="h-3.5 w-3.5" strokeWidth={2.5} />;
      case "locked":    return <Lock className="h-3 w-3" />;
      case "active":    return <CircleDot className="h-3.5 w-3.5" />;
      default:          return <Circle className="h-3.5 w-3.5" />;
    }
  })();
  return (
    <div
      className={cn(
        "h-8 w-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
        cfg.dotBg, cfg.dotText, cfg.dotBorder,
        step.status === "active" && "ring-4 ring-primary/20",
        selected && "ring-4 ring-orange-400 ring-offset-1",
      )}
    >
      {icon}
    </div>
  );
}

function formatTs(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function OdsStepper({
  steps,
  orientation = "vertical",
  selectedId,
  onStepClick,
  className,
}: OdsStepperProps) {
  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-start overflow-x-auto pb-2", className)}>
        {steps.map((step, idx) => {
          const cfg = STATUS_CONFIG[step.status];
          const isLast = idx === steps.length - 1;
          const isSelected = selectedId === step.id;
          const isClickable = !!onStepClick;
          return (
            <div
              key={step.id}
              className={cn("flex items-start flex-1 min-w-0", isClickable && "cursor-pointer")}
              onClick={() => onStepClick?.(step.id)}
            >
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className="flex items-center w-full">
                  <div className="flex-1 h-0.5 bg-transparent" />
                  <StepDot step={step} selected={isSelected} />
                  <div
                    className={cn(
                      "flex-1 h-0.5 transition-colors",
                      isLast ? "bg-transparent" : cfg.connectorColor,
                    )}
                  />
                </div>
                <div className="mt-2 text-center px-1 min-w-0">
                  <p className={cn("text-xs font-semibold leading-tight", cfg.labelColor)}>
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical
  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, idx) => {
        const cfg = STATUS_CONFIG[step.status];
        const isLast = idx === steps.length - 1;
        const isSelected = selectedId === step.id;
        const isClickable = !!onStepClick;
        return (
          <div
            key={step.id}
            className={cn("flex gap-4", isClickable && "cursor-pointer")}
            onClick={() => onStepClick?.(step.id)}
          >
            {/* Left: icon + connector */}
            <div className="flex flex-col items-center">
              <StepDot step={step} selected={isSelected} />
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 my-1 min-h-[1.5rem] transition-colors",
                    cfg.connectorColor,
                  )}
                />
              )}
            </div>
            {/* Right: content */}
            <div className={cn("pb-4 min-w-0", isLast && "pb-0")}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-sm font-semibold", cfg.labelColor)}>{step.label}</span>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide",
                    step.status === "completed" ? "bg-green-100 text-green-700" :
                    step.status === "active"    ? "bg-primary/10 text-primary" :
                    step.status === "rejected"  ? "bg-red-100 text-red-700" :
                    step.status === "locked"    ? "bg-slate-100 text-slate-500" :
                    "bg-slate-100 text-slate-400",
                  )}
                >
                  {cfg.label}
                </span>
              </div>
              {step.description && (
                <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
              )}
              {(step.timestamp || step.user) && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                  {step.timestamp && <span>{formatTs(step.timestamp)}</span>}
                  {step.user && step.timestamp && <span>·</span>}
                  {step.user && <span>{step.user}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
