import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListWarranties,
  useVoidWarranty,
  getListWarrantiesQueryKey,
} from "@workspace/api-client-react";
import type { Warranty, WarrantyStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ShieldOff } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";

const STATUS_VARIANT: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expired: "bg-amber-100 text-amber-700 border-amber-200",
  void: "bg-red-100 text-red-700 border-red-200",
};

export default function WarrantyPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WarrantyStatus>("all");
  const { data, isLoading } = useListWarranties({
    pageSize: 50,
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const voidWarranty = useVoidWarranty();

  const [voidTarget, setVoidTarget] = useState<Warranty | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const items = data?.items ?? [];

  const openVoid = (w: Warranty) => {
    setVoidTarget(w);
    setVoidReason("");
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      notify.error("A reason is required to void a warranty");
      return;
    }
    try {
      await voidWarranty.mutateAsync({ id: voidTarget.id, data: { reason: voidReason.trim() } });
      notify.success(`Warranty ${voidTarget.warranty_number} voided`);
      setVoidTarget(null);
      setVoidReason("");
      qc.invalidateQueries({ queryKey: getListWarrantiesQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? e?.message ?? "Failed to void warranty");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🛡️"
          title="Warranty"
          description="Product warranties minted at customer registration. Status is computed from the installation date and the model's warranty period. Active until expiry, then Expired; may be Voided with a reason."
          certification="certified"
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-sm">Warranties ({items.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-56">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search warranty / serial"
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">No warranties found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warranty #</TableHead>
                    <TableHead>Product Serial</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Months</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.warranty_number}</TableCell>
                      <TableCell className="font-mono text-xs text-orange-600">
                        {w.product_serial ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{w.customer_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{w.start_date}</TableCell>
                      <TableCell className="text-sm">{w.period_months}</TableCell>
                      <TableCell className="text-sm">{w.end_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_VARIANT[w.status] ?? ""}>
                          {w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {w.status !== "void" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-red-600 hover:text-red-700"
                            onClick={() => openVoid(w)}
                          >
                            <ShieldOff className="h-3.5 w-3.5" /> Void
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {w.void_reason ? `Voided: ${w.void_reason}` : "Voided"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void warranty {voidTarget?.warranty_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Reason *</Label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Why is this warranty being voided?"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Voiding is permanent and recorded on the audit trail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-1"
              onClick={confirmVoid}
              disabled={voidWarranty.isPending}
            >
              {voidWarranty.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              Void Warranty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
