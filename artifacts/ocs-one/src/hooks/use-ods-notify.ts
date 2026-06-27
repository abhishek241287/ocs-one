/**
 * ODS Notification System
 * One semantic API for all notifications. No module should call useToast() directly.
 * Usage: const notify = useOdsNotify();
 *        notify.success("Saved");
 *        notify.error("Failed to save", "Check your connection");
 *        notify.warning("Low stock", "Only 4 cells remaining");
 *        notify.info("Order released", "MFG-2026-001 is now active");
 */
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

type NotifyOptions = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

export function useOdsNotify() {
  const { toast } = useToast();

  const success = useCallback(
    (title: string, opts?: NotifyOptions) =>
      toast({
        title: `✅ ${title}`,
        description: opts?.description,
        duration: opts?.duration ?? 3500,
        ...(opts?.action && {
          action: {
            altText: opts.action.label,
            // shadcn ToastAction - basic support
          } as any,
        }),
      }),
    [toast]
  );

  const error = useCallback(
    (title: string, opts?: NotifyOptions) =>
      toast({
        title: `❌ ${title}`,
        description: opts?.description,
        variant: "destructive",
        duration: opts?.duration ?? 6000,
      }),
    [toast]
  );

  const warning = useCallback(
    (title: string, opts?: NotifyOptions) =>
      toast({
        title: `⚠️ ${title}`,
        description: opts?.description,
        duration: opts?.duration ?? 5000,
      }),
    [toast]
  );

  const info = useCallback(
    (title: string, opts?: NotifyOptions) =>
      toast({
        title: `ℹ️ ${title}`,
        description: opts?.description,
        duration: opts?.duration ?? 4000,
      }),
    [toast]
  );

  return { success, error, warning, info };
}
