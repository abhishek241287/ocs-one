import { OdsStepper, OdsStep } from "@/components/ods";

export const STAGE_SEQUENCE = [
  { key: "cell_allocation",  label: "Cell\nAllocation" },
  { key: "assembly",         label: "Assembly" },
  { key: "compression",      label: "Compression" },
  { key: "bms_allocation",   label: "BMS\nInstall" },
  { key: "bms_programming",  label: "BMS\nProgram" },
  { key: "charging",         label: "Charging" },
  { key: "testing",          label: "Testing" },
  { key: "quality_control",  label: "Quality\nControl" },
  { key: "packing",          label: "Packing" },
];

const STAGE_ICONS: Record<string, string> = {
  cell_allocation:  "🔋",
  assembly:         "🔧",
  compression:      "🗜️",
  bms_allocation:   "🖥️",
  bms_programming:  "💾",
  charging:         "⚡",
  testing:          "🧪",
  quality_control:  "✅",
  packing:          "📦",
};

interface Stage {
  stageType: string;
  status: string;
}

interface Props {
  stages: Stage[];
  activeStage?: string | null;
  onSelectStage?: (stageType: string) => void;
}

function mapStatus(status: string | undefined): OdsStep["status"] {
  switch (status) {
    case "approved":    return "completed";
    case "completed":   return "completed";
    case "in_progress": return "active";
    case "rejected":    return "rejected";
    case "pending":     return "pending";
    default:            return "locked";
  }
}

export default function StageStepper({ stages, activeStage, onSelectStage }: Props) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.stageType, s]));

  const steps: OdsStep[] = STAGE_SEQUENCE.map((def) => {
    const stage = stageMap[def.key];
    return {
      id:     def.key,
      label:  def.label.replace("\n", " "),
      status: mapStatus(stage?.status),
      icon:   STAGE_ICONS[def.key],
    };
  });

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-max py-1">
        <OdsStepper
          steps={steps}
          orientation="horizontal"
          selectedId={activeStage ?? undefined}
          onStepClick={onSelectStage}
        />
      </div>
    </div>
  );
}
