import { useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-4xl",
} as const;

interface OdsDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZE_MAP;
  /** If provided, renders Save + Cancel footer with these handlers */
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  isSaveDisabled?: boolean;
  /** Optional error message displayed at bottom of content area */
  errorMessage?: string;
  /** Override footer completely */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function OdsDrawer({
  open,
  onClose,
  title,
  description,
  size = "md",
  onSave,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  isSaving = false,
  isSaveDisabled = false,
  errorMessage,
  footer,
  children,
  className,
}: OdsDrawerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (onSave && !isSaving && !isSaveDisabled) onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onSave, isSaving, isSaveDisabled, onClose]);

  // Auto-focus the first field ONCE when the drawer opens. Keyed on `open` only,
  // so it never re-fires on the re-renders caused by typing — an inline ref
  // callback here would re-run on every render and steal focus after each
  // keystroke (the classic "only the first character is entered" bug).
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.querySelector<HTMLElement>(
        "input:not([type=hidden]),textarea,select,button:not([data-dismiss])"
      )?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [open]);

  const defaultFooter = onSave ? (
    <>
      <p className="text-xs text-muted-foreground mr-auto">
        <kbd className="text-xs font-mono bg-muted px-1 rounded">Ctrl+S</kbd> to save
      </p>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
        {cancelLabel}
      </Button>
      <Button
        type="button"
        onClick={onSave}
        disabled={isSaving || isSaveDisabled}
      >
        {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
        {saveLabel}
      </Button>
    </>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        ref={contentRef}
        className={cn(SIZE_MAP[size], "flex flex-col p-0 gap-0", className)}
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorMessage && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {children}
        </div>

        {/* Footer */}
        {(footer !== undefined ? footer : defaultFooter) && (
          <SheetFooter className="px-6 py-4 border-t shrink-0 flex items-center gap-2">
            {footer !== undefined ? footer : defaultFooter}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
