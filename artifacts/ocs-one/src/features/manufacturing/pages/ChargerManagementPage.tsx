import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Zap, Plus, Pencil, Loader2, RefreshCw, Settings } from "lucide-react";
import {
  useListChargerUnits,
  useCreateChargerUnit,
  useUpdateChargerUnit,
  useUpdateChargerUnitStatus,
} from "@workspace/api-client-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";

type ChargerStatus = "available" | "busy" | "maintenance";

const STATUS_CONFIG: Record<ChargerStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-green-100 text-green-800 border-green-300" },
  busy: { label: "Busy", className: "bg-blue-100 text-blue-800 border-blue-300" },
  maintenance: { label: "Maintenance", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ChargerStatus] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

interface FormData {
  chargerCode: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  outputVoltageV: string;
  maxCurrentA: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  chargerCode: "", model: "", manufacturer: "", serialNumber: "",
  outputVoltageV: "", maxCurrentA: "", notes: "",
};

export default function ChargerManagementPage() {
  const notify = useOdsNotify();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch } = useListChargerUnits(
    statusFilter !== "all" ? { status: statusFilter as ChargerStatus } : {}
  );
  const createUnit = useCreateChargerUnit();
  const updateUnit = useUpdateChargerUnit();
  const updateStatus = useUpdateChargerUnitStatus();

  const units = data?.items ?? [];

  const field = (k: keyof FormData) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (unit: any) => {
    setEditId(unit.id);
    setForm({
      chargerCode: unit.chargerCode ?? "",
      model: unit.model ?? "",
      manufacturer: unit.manufacturer ?? "",
      serialNumber: unit.serialNumber ?? "",
      outputVoltageV: unit.outputVoltageV != null ? String(unit.outputVoltageV) : "",
      maxCurrentA: unit.maxCurrentA != null ? String(unit.maxCurrentA) : "",
      notes: unit.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.chargerCode.trim() || !form.model.trim() || !form.manufacturer.trim() || !form.serialNumber.trim()) {
      notify.error("Charger Code, Model, Manufacturer, Serial Number are required");
      return;
    }
    try {
      const payload = {
        chargerCode: form.chargerCode.trim(),
        model: form.model.trim(),
        manufacturer: form.manufacturer.trim(),
        serialNumber: form.serialNumber.trim(),
        outputVoltageV: form.outputVoltageV ? parseFloat(form.outputVoltageV) : null,
        maxCurrentA: form.maxCurrentA ? parseFloat(form.maxCurrentA) : null,
        notes: form.notes.trim() || null,
      };
      if (editId) {
        await updateUnit.mutateAsync({ id: editId, data: payload });
        notify.success("Charger updated");
      } else {
        await createUnit.mutateAsync({ data: { ...payload, status: "available" } });
        notify.success("Charger registered");
      }
      setShowForm(false);
      refetch();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to save");
    }
  };

  const handleSetStatus = async (id: string, status: ChargerStatus) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      notify.success(`Charger set to ${status}`);
      refetch();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to update status");
    }
  };

  const isSaving = createUnit.isPending || updateUnit.isPending;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              Charger Management
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Register and manage floor charging units</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />Refresh
            </Button>
            <Button onClick={openCreate} className="bg-yellow-600 hover:bg-yellow-700">
              <Plus className="h-4 w-4 mr-1" />Register Charger
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {(["available", "busy", "maintenance"] as ChargerStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const count = (data?.items ?? []).filter((u: any) => u.status === s).length;
            return (
              <Card key={s} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">{cfg.label}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-0.5">{count}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.className.split(" ").slice(0, 1).join(" ")}`}>
                      <Zap className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Filter:</span>
          {["all", "available", "busy", "maintenance"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {s === "all" ? "All" : STATUS_CONFIG[s as ChargerStatus].label}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charger Code</TableHead>
                  <TableHead>Model / Manufacturer</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && units.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-400">
                      No chargers registered. Click "Register Charger" to add one.
                    </TableCell>
                  </TableRow>
                )}
                {units.map((unit: any) => (
                  <TableRow key={unit.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono font-semibold text-gray-900">{unit.chargerCode}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">{unit.model}</div>
                      <div className="text-xs text-gray-500">{unit.manufacturer}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-gray-600">{unit.serialNumber}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {unit.outputVoltageV != null ? `${unit.outputVoltageV}V` : "—"}
                      {" / "}
                      {unit.maxCurrentA != null ? `${unit.maxCurrentA}A` : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={unit.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {unit.status !== "busy" && (
                          <Select
                            value={unit.status}
                            onValueChange={(v) => handleSetStatus(unit.id, v as ChargerStatus)}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <Settings className="h-3 w-3 mr-1" />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="maintenance">Maintenance</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(unit)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Charger" : "Register New Charger"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Charger Code *</Label>
              <Input {...field("chargerCode")} placeholder="e.g. CHG-001" className="h-10 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Serial Number *</Label>
              <Input {...field("serialNumber")} placeholder="Manufacturer serial" className="h-10 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer *</Label>
              <Input {...field("manufacturer")} placeholder="e.g. EV Charger Co." className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Model *</Label>
              <Input {...field("model")} placeholder="e.g. LiFe-30A" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Output Voltage (V)</Label>
              <Input type="number" step="0.1" {...field("outputVoltageV")} placeholder="e.g. 58.4" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Max Current (A)</Label>
              <Input type="number" step="0.1" {...field("maxCurrentA")} placeholder="e.g. 30" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input {...field("notes")} placeholder="Any notes about this charger..." className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-yellow-600 hover:bg-yellow-700">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editId ? "Save Changes" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
