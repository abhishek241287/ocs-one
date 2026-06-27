import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]),' +
  "textarea:not([disabled])," +
  '[role="combobox"]:not([disabled])';

/**
 * Keyboard-first form navigation for operators who prefer not to use the mouse.
 *
 * - Enter  — advances focus to the next field (skips textarea and select triggers)
 * - Shift+Enter — moves focus to the previous field
 * - Ctrl/⌘+S — triggers the form's submit handler
 * - Auto-focuses the first focusable field when the form mounts
 *
 * Works in Sheet drawers, Dialog modals, and standalone page forms.
 * Pass `autoFocusDelay={0}` for page-level forms that don't animate in.
 */
export function useFormKeyboardNav({
  ref,
  onSubmit,
  autoFocusDelay = 80,
}: {
  ref: RefObject<HTMLElement | null>;
  onSubmit?: () => void;
  autoFocusDelay?: number;
}) {
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const timer = setTimeout(() => {
      (el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }, autoFocusDelay);

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        submitRef.current?.();
        return;
      }

      if (e.key === "Enter") {
        const tag = target.tagName.toLowerCase();
        const role = target.getAttribute("role");
        if (tag !== "input" || role === "combobox") return;
        e.preventDefault();
        const fields = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        const idx = fields.indexOf(target);
        if (e.shiftKey) {
          if (idx > 0) fields[idx - 1].focus();
        } else if (idx < fields.length - 1) {
          fields[idx + 1].focus();
        } else {
          submitRef.current?.();
        }
      }
    };

    el.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("keydown", handleKey);
    };
  }, [ref, autoFocusDelay]);
}
