import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useCreateProductionOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateOrderDrawer({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const createOrder = useCreateProductionOrder();

  const [form, setForm] = useState({
    factoryManager: "Sujeet",
    priority: "medium" as "low" | "medium" | "high",
    plannedStartDate: "",
    plannedEndDate: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.factoryManager.trim()) {
      toast({ title: "Factory Manager is required", variant: "destructive" });
      return;
    }
    try {
      await createOrder.mutateAsync({
        data: {
          factoryManager: form.factoryManager.trim(),
          priority: form.priority,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          notes: form.notes || null,
        },
      });
      toast({ title: "Production order created", description: "Battery number auto-assigned" });
      setForm({ factoryManager: "", priority: "medium", plannedStartDate: "", plannedEndDate: "", notes: "" });
      onSuccess();
    } catch {
      toast({ title: "Failed to create order", variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Production Order</SheetTitle>
          <SheetDescription>
            A battery number (BAT-YYYYMMDD-NNNN) and 8 manufacturing stages will be auto-created.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label htmlFor="factoryManager">Factory Manager *</Label>
            <Input
              id="factoryManager"
              placeholder="e.g. Rajesh Kumar"
              value={form.factoryManager}
              onChange={(e) => setForm((f) => ({ ...f, factoryManager: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v as "low" | "medium" | "high" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plannedStartDate">Planned Start</Label>
              <Input
                id="plannedStartDate"
                type="date"
                value={form.plannedStartDate}
                onChange={(e) => setForm((f) => ({ ...f, plannedStartDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plannedEndDate">Planned End</Label>
              <Input
                id="plannedEndDate"
                type="date"
                value={form.plannedEndDate}
                onChange={(e) => setForm((f) => ({ ...f, plannedEndDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              disabled={createOrder.isPending}
            >
              {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Order
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
