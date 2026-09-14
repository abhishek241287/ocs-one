import { useMemo, useState } from "react";
import {
  getDownloadInventoryImportTemplateUrl,
  useCancelInventoryImport,
  useConfirmInventoryImport,
  useGetInventoryImport,
  useUploadInventoryImport,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Download, CheckCircle2, XCircle } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import type { InventoryInputContext } from "./types";

type Props = InventoryInputContext & {
  canSubmit: boolean;
  onSubmitted?: (documentId: string) => void;
};

function errorMessage(error: any, fallback: string) {
  return error?.data?.error ?? error?.data?.message ?? fallback;
}

export default function CsvCapturePanel({
  materials,
  canSubmit,
  onSubmitted,
}: Props) {
  const notify = useOdsNotify();
  const [materialId, setMaterialId] = useState("");
  const [filename, setFilename] = useState("");
  const [csv, setCsv] = useState("");
  const [sessionId, setSessionId] = useState("");
  const upload = useUploadInventoryImport();
  const cancel = useCancelInventoryImport();
  const confirmMutation = useConfirmInventoryImport({
    request: sessionId
      ? { headers: { "Idempotency-Key": `inventory-import-${sessionId}` } }
      : undefined,
  });
  const detail = useGetInventoryImport(sessionId, {
    query: { enabled: Boolean(sessionId), refetchInterval: 1000 } as any,
  });
  const rows = detail.data?.rows ?? [];
  const session = detail.data?.session;
  const templateUrl = useMemo(
    () =>
      materialId
        ? getDownloadInventoryImportTemplateUrl({ material_id: materialId })
        : undefined,
    [materialId],
  );

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setFilename(file.name);
    setCsv(await file.text());
  };

  const stage = async () => {
    if (!materialId) {
      notify.error("Select a material before uploading CSV");
      return;
    }
    if (!csv.trim()) {
      notify.error("Choose a CSV file first");
      return;
    }
    try {
      const staged = await upload.mutateAsync({
        data: { csv, filename: filename || undefined },
      });
      setSessionId(staged.id);
      notify.success("CSV staged. Review the server validation results before confirming.");
    } catch (error: any) {
      notify.error(errorMessage(error, "CSV upload failed"));
    }
  };

  const confirm = async () => {
    if (!sessionId) return;
    try {
      const result = await confirmMutation.mutateAsync({ id: sessionId, data: {} });
      notify.success("CSV import confirmed as a draft GRN");
      onSubmitted?.(result.document_id);
    } catch (error: any) {
      notify.error(errorMessage(error, "CSV confirmation failed"));
    }
  };

  const abandon = async () => {
    if (!sessionId) return;
    try {
      await cancel.mutateAsync({ id: sessionId });
      setSessionId("");
      setCsv("");
      setFilename("");
      notify.success("CSV import cancelled");
    } catch (error: any) {
      notify.error(errorMessage(error, "Unable to cancel CSV import"));
    }
  };

  const canConfirm =
    Boolean(sessionId) &&
    session?.invalid_rows === 0 &&
    (session?.valid_rows ?? 0) > 0 &&
    !["CONFIRMED", "CANCELLED"].includes(session?.status ?? "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Material *</Label>
          <Select value={materialId} onValueChange={setMaterialId} disabled={!canSubmit || Boolean(sessionId)}>
            <SelectTrigger>
              <SelectValue placeholder="Select material…" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          {templateUrl ? (
            <a href={templateUrl} download className="inline-flex">
              <Button type="button" variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Download template
              </Button>
            </a>
          ) : (
            <Button type="button" variant="outline" disabled className="gap-2">
              <Download className="h-4 w-4" />
              Download template
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">CSV file</Label>
        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={!canSubmit || Boolean(sessionId)}
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        {filename && <p className="text-xs text-muted-foreground">{filename}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {!sessionId ? (
          <Button onClick={stage} disabled={!canSubmit || upload.isPending} className="gap-2">
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload and validate
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={abandon} disabled={cancel.isPending}>
              Cancel import
            </Button>
            <Button
              onClick={confirm}
              disabled={!canSubmit || !canConfirm || confirmMutation.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm valid rows
            </Button>
          </>
        )}
      </div>

      {session && (
        <div className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <div>
              <p className="text-sm font-medium">{session.import_number}</p>
              <p className="text-xs text-muted-foreground">
                {session.total_rows} rows · {session.valid_rows} valid · {session.invalid_rows} invalid · {session.status}
              </p>
            </div>
            {session.invalid_rows > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <XCircle className="h-4 w-4" /> Fix invalid rows and upload again
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 text-left">
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Values</th>
                  <th className="p-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-2">{row.row_number}</td>
                    <td className="p-2 font-medium">{row.status}</td>
                    <td className="max-w-[28rem] p-2">
                      <pre className="whitespace-pre-wrap break-words text-[11px]">
                        {JSON.stringify(row.canonical ?? row.raw ?? {}, null, 2)}
                      </pre>
                    </td>
                    <td className="p-2 text-red-600">
                      {(row.errors ?? []).map((item, index) => (
                        <div key={`${item.attribute_code}-${index}`}>
                          {item.attribute_code}: {item.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}