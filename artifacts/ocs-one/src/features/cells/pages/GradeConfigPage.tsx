import { useState, useEffect } from "react";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGetCellGradeConfig, useUpdateCellGradeConfig } from "@workspace/api-client-react";
import { Settings, Loader2, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type ConfigForm = {
  gradeAMinCapacityPct: string;
  gradeAMaxIrMult: string;
  gradeBMinCapacityPct: string;
  gradeBMaxIrMult: string;
  gradeCMinCapacityPct: string;
  gradeCMaxIrMult: string;
  maxCapacityDiffAh: string;
  maxIrDiffMohm: string;
  maxVoltageDiffMv: string;
  nominalIrMohm: string;
};

function ConfigRow({ label, value, onChange, unit, hint }: { label: string; value: string; onChange: (v: string) => void; unit?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 w-40">
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-right"
        />
        {unit && <span className="text-xs text-muted-foreground whitespace-nowrap w-10">{unit}</span>}
      </div>
    </div>
  );
}

export default function GradeConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetCellGradeConfig();
  const update = useUpdateCellGradeConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/config"] });
        toast({ title: "Configuration saved" });
      },
      onError: (e: any) => toast({ title: "Error saving config", description: e?.message, variant: "destructive" }),
    },
  });

  const [form, setForm] = useState<ConfigForm>({
    gradeAMinCapacityPct: "98",
    gradeAMaxIrMult: "1.05",
    gradeBMinCapacityPct: "95",
    gradeBMaxIrMult: "1.10",
    gradeCMinCapacityPct: "90",
    gradeCMaxIrMult: "1.15",
    maxCapacityDiffAh: "0.5",
    maxIrDiffMohm: "2.0",
    maxVoltageDiffMv: "5.0",
    nominalIrMohm: "1.0",
  });

  useEffect(() => {
    if (config) {
      setForm({
        gradeAMinCapacityPct: String(config.gradeAMinCapacityPct),
        gradeAMaxIrMult: String(config.gradeAMaxIrMult),
        gradeBMinCapacityPct: String(config.gradeBMinCapacityPct),
        gradeBMaxIrMult: String(config.gradeBMaxIrMult),
        gradeCMinCapacityPct: String(config.gradeCMinCapacityPct),
        gradeCMaxIrMult: String(config.gradeCMaxIrMult),
        maxCapacityDiffAh: String(config.maxCapacityDiffAh),
        maxIrDiffMohm: String(config.maxIrDiffMohm),
        maxVoltageDiffMv: String(config.maxVoltageDiffMv),
        nominalIrMohm: String(config.nominalIrMohm),
      });
    }
  }, [config]);

  const set = (k: keyof ConfigForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    update.mutate({
      data: {
        gradeAMinCapacityPct: parseFloat(form.gradeAMinCapacityPct),
        gradeAMaxIrMult: parseFloat(form.gradeAMaxIrMult),
        gradeBMinCapacityPct: parseFloat(form.gradeBMinCapacityPct),
        gradeBMaxIrMult: parseFloat(form.gradeBMaxIrMult),
        gradeCMinCapacityPct: parseFloat(form.gradeCMinCapacityPct),
        gradeCMaxIrMult: parseFloat(form.gradeCMaxIrMult),
        maxCapacityDiffAh: parseFloat(form.maxCapacityDiffAh),
        maxIrDiffMohm: parseFloat(form.maxIrDiffMohm),
        maxVoltageDiffMv: parseFloat(form.maxVoltageDiffMv),
        nominalIrMohm: parseFloat(form.nominalIrMohm),
      },
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="text-primary" size={24} />
              Grade Configuration
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure cell grading tolerance rules — changes take effect immediately
            </p>
          </div>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Save Config
          </Button>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <h3 className="font-semibold">Grade A — Premium</h3>
            </div>
            <div className="space-y-3">
              <ConfigRow
                label="Minimum Capacity %"
                value={form.gradeAMinCapacityPct}
                onChange={set("gradeAMinCapacityPct")}
                unit="%"
                hint="% of nominal capacity (e.g. 98 = ≥98%)"
              />
              <ConfigRow
                label="Maximum IR Multiplier"
                value={form.gradeAMaxIrMult}
                onChange={set("gradeAMaxIrMult")}
                unit="× IR"
                hint="Multiple of nominal IR (e.g. 1.05 = ≤105% of nominal)"
              />
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <h3 className="font-semibold">Grade B — Standard</h3>
            </div>
            <div className="space-y-3">
              <ConfigRow label="Minimum Capacity %" value={form.gradeBMinCapacityPct} onChange={set("gradeBMinCapacityPct")} unit="%" />
              <ConfigRow label="Maximum IR Multiplier" value={form.gradeBMaxIrMult} onChange={set("gradeBMaxIrMult")} unit="× IR" />
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <h3 className="font-semibold">Grade C — Marginal</h3>
            </div>
            <div className="space-y-3">
              <ConfigRow label="Minimum Capacity %" value={form.gradeCMinCapacityPct} onChange={set("gradeCMinCapacityPct")} unit="%" />
              <ConfigRow label="Maximum IR Multiplier" value={form.gradeCMaxIrMult} onChange={set("gradeCMaxIrMult")} unit="× IR" />
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Baseline & Matching Tolerances</h3>
            <div className="space-y-3">
              <ConfigRow
                label="Nominal IR (mΩ)"
                value={form.nominalIrMohm}
                onChange={set("nominalIrMohm")}
                unit="mΩ"
                hint="Reference IR value used for grade multiplier calculations"
              />
              <ConfigRow
                label="Max Capacity Diff (Ah)"
                value={form.maxCapacityDiffAh}
                onChange={set("maxCapacityDiffAh")}
                unit="Ah"
                hint="Max allowed capacity spread within a battery pack"
              />
              <ConfigRow
                label="Max IR Diff (mΩ)"
                value={form.maxIrDiffMohm}
                onChange={set("maxIrDiffMohm")}
                unit="mΩ"
                hint="Max allowed IR spread within a battery pack"
              />
              <ConfigRow
                label="Max Voltage Diff (mV)"
                value={form.maxVoltageDiffMv}
                onChange={set("maxVoltageDiffMv")}
                unit="mV"
                hint="Max allowed voltage spread within a battery pack"
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
