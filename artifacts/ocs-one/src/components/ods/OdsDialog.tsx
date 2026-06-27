import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Trash2, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type OdsDialogVariant = "default" | "danger" | "warning" | "success" | "confirm";

const VARIANT_STYLES: Record<
  OdsDialogVariant,
  { icon: React.ReactNode; confirmClass: string; iconClass: string }
> = {
  danger: {
    icon: <Trash2 className="h-5 w-5" />,
    confirmClass: "bg-red-600 hover:bg-red-700 text-white",
    iconClass: "bg-red-100 text-red-600",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5" />,
    confirmClass: "bg-yellow-600 hover:bg-yellow-700 text-white",
    iconClass: "bg-yellow-100 text-yellow-600",
  },
  success: {
    icon: <CheckCircle className="h-5 w-5" />,
    confirmClass: "",
    iconClass: "bg-green-100 text-green-600",
  },
  confirm: {
    icon: <Info className="h-5 w-5" />,
    confirmClass: "",
    iconClass: "bg-blue-100 text-blue-600",
  },
  default: {
    icon: null,
    confirmClass: "",
    iconClass: "",
  },
};

interface OdsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  variant?: OdsDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** Prevent closing on overlay click */
  modal?: boolean;
}

export function OdsDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  variant = "default",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  modal = true,
}: OdsDialogProps) {
  const { icon, confirmClass, iconClass } = VARIANT_STYLES[variant];

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onConfirm, loading]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !modal) onClose(); else if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {icon && (
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-full shrink-0", iconClass)}>
                {icon}
              </div>
            )}
            <div className="flex-1 pt-0.5">
              <DialogTitle className="text-base">{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1 text-sm">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 sm:flex-none">
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={cn("flex-1 sm:flex-none", confirmClass)}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
