import { useEffect, useRef, type RefObject } from "react";

/**
 * Module-level keyboard shortcuts:
 *   Ctrl/⌘+N  → onNew()  (blocked while typing or inside a dialog)
 *   F2         → onEdit() (blocked while typing or inside a dialog)
 *   Ctrl/⌘+F  → focus searchRef (always intercepts, prevents browser find)
 */
export function useModuleShortcuts({
  onNew,
  onEdit,
  searchRef,
}: {
  onNew?: () => void;
  onEdit?: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const onNewRef = useRef(onNew);
  const onEditRef = useRef(onEdit);
  onNewRef.current = onNew;
  onEditRef.current = onEdit;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const inDialog = !!target.closest('[role="dialog"]');

      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (searchRef?.current) {
          e.preventDefault();
          searchRef.current.focus();
          searchRef.current.select();
        }
        return;
      }

      if (isTyping || inDialog) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        onNewRef.current?.();
        return;
      }

      if (e.key === "F2") {
        onEditRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchRef]);
}
