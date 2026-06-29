import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetDispatch,
  useReverseDispatch,
  getGetDispatchQueryKey,
  getListDispatchesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, Loader2, Printer, Undo2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { useOdsNotify } from "@/hooks/use-ods-notify";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

export default function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatchId = id ?? "";
  const notify = useOdsNotify();
  const qc = useQueryClient();

  const { data: dispatch, isLoading } = useGetDispatch(dispatchId);
  const reverseDispatch = useReverseDispatch();

  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleReverse = async () => {
    if (!reason.trim()) {
      notify.error("A reason is required to reverse a dispatch");
      return;
    }
    try {
      await reverseDispatch.mutateAsync({
        id: dispatchId,
        data: { reason: reason.trim() },
      });
      notify.success("Dispatch reversed", {
        description: "Products returned to packed status.",
      });
      setReverseOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: getGetDispatchQueryKey(dispatchId) });
      qc.invalidateQueries({ queryKey: getListDispatchesQueryKey() });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to reverse dispatch");
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!dispatch) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">Dispatch not found.</div>
      </AppLayout>
    );
  }

  const isReversed = dispatch.status === "reversed";
  const dealer = dispatch.dealer;
  const items = dispatch.items ?? [];

  return (
    <AppLayout>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #dispatch-note, #dispatch-note * { visibility: visible !important; }
          #dispatch-note {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 24px; box-shadow: none !important; border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="p-6 space-y-5">
        <div className="flex items-center gap-4 no-print">
          <Link href="/fulfillment/dispatch/list">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Dispatches
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">
                {dispatch.dispatch_number}
              </h1>
              <Badge
                variant={isReversed ? "destructive" : "default"}
                className={isReversed ? "" : "bg-green-600 hover:bg-green-600"}
              >
                {isReversed ? "Reversed" : "Dispatched"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Invoice <strong className="font-mono">{dispatch.invoice_number}</strong>{" "}
              · {fmtDate(dispatch.dispatch_date)} · {dispatch.item_count} item(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Note
            </Button>
            {!isReversed && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={() => setReverseOpen(true)}
              >
                <Undo2 className="h-4 w-4" />
                Reverse
              </Button>
            )}
          </div>
        </div>

        {isReversed && dispatch.reversal && (
          <Card className="border-red-200 bg-red-50/50 no-print">
            <CardContent className="pt-4 pb-4 text-sm">
              <span className="font-semibold text-red-700">Reversed</span> by{" "}
              {dispatch.reversal.reversed_by} on{" "}
              {new Date(dispatch.reversal.reversed_at).toLocaleString()} —{" "}
              <span className="text-muted-foreground">{dispatch.reversal.reason}</span>
            </CardContent>
          </Card>
        )}

        {/* Printable Dispatch Note */}
        <Card id="dispatch-note">
          <CardContent className="p-8 space-y-6">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="text-lg font-bold">OCS Oorja Green Pvt. Ltd.</div>
                <div className="text-xs text-muted-foreground">
                  Manufacturing — LiFePO4 Battery Packs
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold tracking-wide">DISPATCH NOTE</div>
                {isReversed && (
                  <div className="text-xs font-semibold text-red-600 mt-1">
                    *** REVERSED ***
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Dispatch Details
                </div>
                <div>
                  <span className="text-muted-foreground">Dispatch No: </span>
                  <span className="font-mono font-medium">{dispatch.dispatch_number}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Invoice No: </span>
                  <span className="font-mono font-medium">{dispatch.invoice_number}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date: </span>
                  <span className="font-medium">{fmtDate(dispatch.dispatch_date)}</span>
                </div>
                {dispatch.dispatched_by && (
                  <div>
                    <span className="text-muted-foreground">Dispatched By: </span>
                    <span className="font-medium">{dispatch.dispatched_by}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Deliver To
                </div>
                <div className="font-medium">{dealer?.name ?? "—"}</div>
                {dealer?.code && (
                  <div className="text-xs text-muted-foreground font-mono">{dealer.code}</div>
                )}
                {dealer?.address && <div className="text-xs">{dealer.address}</div>}
                {dealer?.gst_number && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">GST: </span>
                    {dealer.gst_number}
                  </div>
                )}
                {(dealer?.contact_person || dealer?.mobile) && (
                  <div className="text-xs">
                    {dealer?.contact_person}
                    {dealer?.contact_person && dealer?.mobile ? " · " : ""}
                    {dealer?.mobile}
                  </div>
                )}
              </div>
            </div>

            <table className="w-full text-sm border-t border-b">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold w-10">#</th>
                  <th className="py-2 pr-2 font-semibold">Serial No.</th>
                  <th className="py-2 pr-2 font-semibold">Category</th>
                  <th className="py-2 pr-2 font-semibold">Model</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-2 pr-2 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 pr-2 font-mono font-medium">{it.product_serial}</td>
                    <td className="py-2 pr-2">{it.category_name ?? "—"}</td>
                    <td className="py-2 pr-2">{it.model_name ?? it.model_code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-sm">
              <span className="text-muted-foreground">Total Quantity: </span>
              <span className="font-bold">{items.length}</span>
            </div>

            <div className="grid grid-cols-3 gap-8 pt-12 text-xs text-center">
              <div className="border-t pt-2">Prepared By</div>
              <div className="border-t pt-2">Authorized Signatory</div>
              <div className="border-t pt-2">Received By (Dealer)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Dispatch {dispatch.dispatch_number}</DialogTitle>
            <DialogDescription>
              This returns all {dispatch.item_count} product(s) to{" "}
              <strong>packed</strong> status and clears the dealer assignment. This
              action is recorded and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Reason for reversal *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong dealer selected; invoice cancelled"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-1"
              onClick={handleReverse}
              disabled={reverseDispatch.isPending}
            >
              {reverseDispatch.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
