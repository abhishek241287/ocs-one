import { useState } from "react";
import { useGetOrderGenealogy, useAddGenealogyRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMPONENT_TYPES = ["cell", "bms", "cabinet", "connector", "busbar", "cable", "other"];

interface Props {
  orderId: string;
}

export default function GenealogyView({ orderId }: Props) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetOrderGenealogy(orderId);
  const addRecord = useAddGenealogyRecord();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    componentType: "cell",
    componentName: "",
    quantity: 1,
    serialNumber: "",
    notes: "",
  });

  const records = data?.items ?? [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.componentName.trim()) {
      toast({ title: "Component name required", variant: "destructive" });
      return;
    }
    try {
      await addRecord.mutateAsync({
        id: orderId,
        data: {
          componentType: form.componentType,
          componentName: form.componentName.trim(),
          quantity: form.quantity,
          serialNumber: form.serialNumber || null,
          notes: form.notes || null,
        },
      });
      toast({ title: "Component added to genealogy" });
      setForm({ componentType: "cell", componentName: "", quantity: 1, serialNumber: "", notes: "" });
      setShowForm(false);
      refetch();
    } catch {
      toast({ title: "Failed to add component", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{records.length} component(s) recorded</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {showForm ? "Cancel" : "Add Component"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="border rounded-lg p-4 bg-orange-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Component Type</Label>
              <Select
                value={form.componentType}
                onValueChange={(v) => setForm((f) => ({ ...f, componentType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Component Name / Part # *</Label>
            <Input
              placeholder="e.g. CATL 50Ah LFP Cell"
              value={form.componentName}
              onChange={(e) => setForm((f) => ({ ...f, componentName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Serial Number</Label>
            <Input
              placeholder="Optional serial / batch number"
              value={form.serialNumber}
              onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
            />
          </div>
          <Button type="submit" size="sm" disabled={addRecord.isPending} className="bg-orange-600 hover:bg-orange-700">
            {addRecord.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Add to Genealogy
          </Button>
        </form>
      )}

      {records.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm border rounded-lg">
          No components recorded yet
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Component</TableHead>
                <TableHead className="text-xs">Qty</TableHead>
                <TableHead className="text-xs">Serial #</TableHead>
                <TableHead className="text-xs">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="text-xs font-medium uppercase px-2 py-0.5 bg-gray-100 rounded">
                      {r.componentType}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.componentName}</TableCell>
                  <TableCell className="text-sm">{r.quantity}</TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">{r.serialNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
