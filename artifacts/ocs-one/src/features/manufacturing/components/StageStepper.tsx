import { CheckCircle2, Circle, Clock, XCircle, PlayCircle } from "lucide-react";

export const STAGE_SEQUENCE = [
  { key: "cell_allocation", label: "Cell\nAllocation" },
  { key: "assembly", label: "Assembly" },
  { key: "compression", label: "Compression" },
  { key: "bms_allocation", label: "BMS\nInstall" },
  { key: "bms_programming", label: "BMS\nProgram" },
  { key: "charging", label: "Charging" },
  { key: "testing", label: "Testing" },
  { key: "quality_control", label: "Quality\nControl" },
  { key: "packing", label: "Packing" },
];

interface Stage {
  stageType: string;
  status: string;
}

interface Props {
  stages: Stage[];
  activeStage?: string | null;
  onSelectStage?: (stageType: string) => void;
}

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <CheckCircle2 className="h-6 w-6 text-green-500" />;
    case "completed":
      return <Clock className="h-6 w-6 text-yellow-500" />;
    case "in_progress":
      return <PlayCircle className="h-6 w-6 text-blue-500" />;
    case "rejected":
      return <XCircle className="h-6 w-6 text-red-500" />;
    default:
      return <Circle className="h-6 w-6 text-gray-300" />;
  }
}

const STATUS_BG: Record<string, string> = {
  approved: "bg-green-50 border-green-200",
  completed: "bg-yellow-50 border-yellow-200",
  in_progress: "bg-blue-50 border-blue-200",
  rejected: "bg-red-50 border-red-200",
  pending: "bg-gray-50 border-gray-200",
};

export default function StageStepper({ stages, activeStage, onSelectStage }: Props) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.stageType, s]));

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start min-w-max gap-0">
        {STAGE_SEQUENCE.map((def, idx) => {
          const stage = stageMap[def.key];
          const status = stage?.status ?? "pending";
          const isActive = activeStage === def.key;
          const isClickable = !!onSelectStage && !!stage;

          return (
            <div key={def.key} className="flex items-center">
              <div
                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border-2 transition-all w-24
                  ${STATUS_BG[status] ?? STATUS_BG.pending}
                  ${isActive ? "ring-2 ring-orange-400 ring-offset-1" : ""}
                  ${isClickable ? "cursor-pointer hover:shadow-sm" : ""}
                `}
                onClick={() => isClickable && onSelectStage?.(def.key)}
              >
                <StageIcon status={status} />
                <span className="text-[10px] font-medium text-center leading-tight text-gray-700 whitespace-pre-line">
                  {def.label}
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-wide ${
                  status === "approved" ? "text-green-600" :
                  status === "completed" ? "text-yellow-600" :
                  status === "in_progress" ? "text-blue-600" :
                  status === "rejected" ? "text-red-600" :
                  "text-gray-400"
                }`}>
                  {status.replace(/_/g, " ")}
                </span>
              </div>
              {idx < STAGE_SEQUENCE.length - 1 && (
                <div className={`h-0.5 w-4 ${
                  stageMap[STAGE_SEQUENCE[idx + 1].key]?.status !== "pending" || status === "approved"
                    ? "bg-green-300"
                    : "bg-gray-200"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
