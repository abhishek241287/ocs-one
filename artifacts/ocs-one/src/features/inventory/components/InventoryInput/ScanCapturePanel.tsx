import { useEffect, useRef, useState } from "react";
import {
  useCancelInventoryScanSession,
  useConfirmInventoryScanSession,
  useCreateInventoryScanSession,
  useGetInventoryScanSession,
  useRemoveInventoryScanItem,
  useScanInventoryItem,
  usePreviewAttributeTemplateVersion,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Play, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import DynamicCaptureFields from "./DynamicCaptureFields";
import { validateCaptureValues, type CaptureValues, type InventoryInputContext } from "./types";

type Props = InventoryInputContext & {
  canSubmit: boolean;
  onSubmitted?: (documentId: string) => void;
};

function errorMessage(error: any, fallback: string) {
  return error?.data?.error ?? error?.data?.message ?? fallback;
}

export default function ScanCapturePanel({
  supplierId,
  lines,
  canSubmit,
  onSubmitted,
}: Props) {
  const notify = useOdsNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sessionId, setSessionId] = useState("");
  const [payload, setPayload] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("1");
  const [editValues, setEditValues] = useState<CaptureValues>([]);
  const createSession = useCreateInventoryScanSession();
  const scan = useScanInventoryItem();
  const remove = useRemoveInventoryScanItem();
  const cancel = useCancelInventoryScanSession();
  const confirmMutation = useConfirmInventoryScanSession({
    request: sessionId
      ? { headers: { "Idempotency-Key": `inventory-scan-${sessionId}` } }
      : undefined,
  });
  const detail = useGetInventoryScanSession(sessionId, {
    query: { enabled: Boolean(sessionId), refetchInterval: 1000 } as any,
  });
  const session = detail.data?.session;
  const items = detail.data?.items ?? [];
  const templateVersionId = session?.template_version_id ?? "";
  const preview = usePreviewAttributeTemplateVersion(templateVersionId, {
    query: { enabled: Boolean(templateVersionId) } as any,
  });
  const activeItems = items.filter((item) => item.state !== "REMOVED");
  const firstMaterialId = lines.find((line) => line.material_id)?.material_id;

  useEffect(() => {
    if (sessionId) inputRef.current?.focus();
  }, [sessionId]);

  const start = async () => {
    if (!supplierId) {
      notify.error("Select a supplier in the GRN header first");
      return;
    }
    try {
      const created = await createSession.mutateAsync({
        data: {
          supplier_id: supplierId,
          ...(firstMaterialId ? { material_id: firstMaterialId } : {}),
        },
      });
      setSessionId(created.id);
      notify.success("Scan session started. Focus stays on the scan field.");
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to start scan session"));
    }
  };

  const submitScan = async () => {
    const nextPayload = payload.trim();
    if (!sessionId || !nextPayload) return;
    try {
      await scan.mutateAsync({
        id: sessionId,
        data: { payload: nextPayload },
      });
      setPayload("");
      inputRef.current?.focus();
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to record scan"));
    }
  };

  const beginEdit = (item: (typeof items)[number]) => {
    setEditingId(item.id);
    setEditQuantity(String(item.quantity ?? 1));
    setEditValues(item.attributes ?? []);
  };

  const saveEdit = async (item: (typeof items)[number]) => {
    if (!sessionId) return;
    const errors = validateCaptureValues(preview.data, editValues);
    if (errors.length) {
      notify.error(errors[0]);
      return;
    }
    try {
      // The certified scan API is append-only. Replace an item by retaining it
      // as REMOVED and posting a new scan with the edited canonical payload.
      await remove.mutateAsync({ id: sessionId, itemId: item.id });
      await scan.mutateAsync({
        id: sessionId,
        data: {
          payload: item.payload_raw,
          quantity: Number(editQuantity),
          attributes: editValues,
        },
      });
      setEditingId(null);
      notify.success("Scan item replaced with the edited values");
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to save scan item"));
    }
  };

  const removeItem = async (itemId: string) => {
    if (!sessionId) return;
    try {
      await remove.mutateAsync({ id: sessionId, itemId });
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to remove scan item"));
    }
  };

  const confirm = async () => {
    if (!sessionId) return;
    try {
      const result = await confirmMutation.mutateAsync({ id: sessionId, data: {} });
      notify.success("Scan session confirmed as a draft GRN");
      onSubmitted?.(result.document_id);
    } catch (error: any) {
      notify.error(errorMessage(error, "Scan confirmation failed"));
    }
  };

  const stop = async () => {
    if (!sessionId) return;
    try {
      await cancel.mutateAsync({ id: sessionId });
      setSessionId("");
      setEditingId(null);
      notify.success("Scan session cancelled");
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to cancel scan session"));
    }
  };

  const readyToConfirm =
    activeItems.length > 0 &&
    activeItems.every((item) => item.state === "READY") &&
    (session?.unknown ?? 0) === 0 &&
    (session?.duplicate ?? 0) === 0;

  return (
    <div className="space-y-4">
      {!sessionId ? (
        <div className="rounded-md border border-dashed p-5 text-center">
          <p className="text-sm font-medium">Keyboard-wedge scan session</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect or focus the scanner, then start a session. No camera or decoder is required.
          </p>
          <Button onClick={start} disabled={!canSubmit || createSession.isPending} className="mt-4 gap-2">
            {createSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start scan session
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1 space-y-1.5">
                <Label className="text-xs">Scan input</Label>
                <Input
                  ref={inputRef}
                  value={payload}
                  onChange={(event) => setPayload(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitScan();
                    }
                  }}
                  placeholder="Scan barcode or type payload, then press Enter"
                  disabled={!canSubmit || scan.isPending}
                  autoComplete="off"
                />
              </div>
              <Button onClick={() => void submitScan()} disabled={!canSubmit || !payload.trim() || scan.isPending}>
                Record scan
              </Button>
              <Button variant="outline" onClick={() => void stop()} disabled={cancel.isPending}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </div>
            {session && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                {[
                  ["Total", session.total],
                  ["Ready", session.ready],
                  ["Unknown", session.unknown],
                  ["Duplicate", session.duplicate],
                  ["Removed", session.removed],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border bg-background p-2">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2 text-xs font-semibold">#{item.item_number}</span>
                    <code className="text-xs">{item.payload_raw}</code>
                    <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[11px]">{item.state}</span>
                    {item.duplicate_scan_count > 0 && (
                      <span className="ml-2 text-[11px] text-amber-700">
                        duplicate ×{item.duplicate_scan_count}
                      </span>
                    )}
                  </div>
                  {item.state !== "REMOVED" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => beginEdit(item)} disabled={!canSubmit}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeItem(item.id)} disabled={!canSubmit}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  )}
                </div>

                {editingId === item.id && (
                  <div className="mt-3 space-y-3 rounded bg-muted/30 p-3">
                    <div className="max-w-xs space-y-1.5">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={editQuantity}
                        onChange={(event) => setEditQuantity(event.target.value)}
                      />
                    </div>
                    <DynamicCaptureFields
                      preview={preview.data}
                      values={editValues}
                      onChange={setEditValues}
                      disabled={!canSubmit}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button onClick={() => void saveEdit(item)} disabled={!canSubmit || remove.isPending || scan.isPending}>
                        <Save className="mr-1 h-4 w-4" /> Save replacement
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!items.length && (
              <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                No scans yet.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={confirm}
              disabled={!canSubmit || !readyToConfirm || confirmMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" /> Confirm scan session
            </Button>
          </div>
        </>
      )}
    </div>
  );
}