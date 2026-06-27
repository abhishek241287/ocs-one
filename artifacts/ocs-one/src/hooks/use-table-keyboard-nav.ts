import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * ODS Standard 15 — Keyboard Table Navigation
 *
 * Reusable engine that gives any enterprise data table full keyboard operation.
 * Used by OdsDataTable so every module benefits automatically; can also be
 * attached to bespoke tables (e.g. tables with expandable detail rows).
 *
 * Behaviour:
 *   ↑ / ↓   → move the active row
 *   Home    → first row
 *   End     → last row
 *   Enter   → open/edit the active record (onEnter)
 *   H       → open history for the active record (onHistory, if provided)
 *   Space   → toggle selection of the active row
 *   Esc     → clear selection
 *
 * The active row (cursor) and the selected row (Space) are tracked separately so
 * a visible focus indicator can be shown for both.
 */
export interface UseTableKeyboardNavOptions {
  /** Number of navigable data rows currently rendered. */
  rowCount: number;
  /** Master switch — when false the handler is inert. */
  enabled?: boolean;
  /** Enter on the active row. */
  onEnter?: (index: number) => void;
  /** "H" on the active row. Omit to disable the history shortcut. */
  onHistory?: (index: number) => void;
  /** Fires whenever the Space-selected row changes (null when cleared). */
  onSelectChange?: (index: number | null) => void;
}

export interface UseTableKeyboardNavResult {
  /** Row the keyboard cursor is on, or -1 when none. */
  activeIndex: number;
  /** Row toggled via Space, or null. */
  selectedIndex: number | null;
  setActiveIndex: (index: number) => void;
  clearSelection: () => void;
  /** Attach to each navigable row to register its DOM node for scroll-into-view. */
  registerRow: (index: number) => (el: HTMLTableRowElement | null) => void;
  /** Spread onto the focusable table container. */
  containerProps: {
    tabIndex: number;
    role: string;
    onKeyDown: (e: KeyboardEvent) => void;
    "aria-label": string;
  };
}

export function useTableKeyboardNav({
  rowCount,
  enabled = true,
  onEnter,
  onHistory,
  onSelectChange,
}: UseTableKeyboardNavOptions): UseTableKeyboardNavResult {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // Keep indices valid when the row set shrinks (filter / pagination).
  useEffect(() => {
    if (activeIndex >= rowCount) setActiveIndex(rowCount - 1);
    if (selectedIndex !== null && selectedIndex >= rowCount) {
      setSelectedIndex(null);
      onSelectChange?.(null);
    }
  }, [rowCount, activeIndex, selectedIndex, onSelectChange]);

  const registerRow = useCallback(
    (index: number) => (el: HTMLTableRowElement | null) => {
      rowRefs.current[index] = el;
    },
    []
  );

  const move = useCallback(
    (next: number) => {
      if (rowCount === 0) return;
      const clamped = Math.max(0, Math.min(rowCount - 1, next));
      setActiveIndex(clamped);
      rowRefs.current[clamped]?.scrollIntoView({ block: "nearest" });
    },
    [rowCount]
  );

  const clearSelection = useCallback(() => {
    setSelectedIndex(null);
    onSelectChange?.(null);
  }, [onSelectChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || rowCount === 0) return;

      // Never hijack keys aimed at interactive descendants. Form controls need
      // their own typing/selection behaviour, and buttons / links / menu
      // triggers must receive Enter and Space to activate — otherwise the table
      // nav would swallow a row's action-button activation.
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.closest(
          'input, textarea, select, button, a[href], [role="button"], [role="menuitem"], [role="link"], [contenteditable="true"]'
        )
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(activeIndex < 0 ? 0 : activeIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          move(activeIndex < 0 ? rowCount - 1 : activeIndex - 1);
          break;
        case "Home":
          e.preventDefault();
          move(0);
          break;
        case "End":
          e.preventDefault();
          move(rowCount - 1);
          break;
        case "Enter":
          if (activeIndex >= 0) {
            e.preventDefault();
            onEnter?.(activeIndex);
          }
          break;
        case " ":
        case "Spacebar":
          if (activeIndex >= 0) {
            e.preventDefault();
            const next = selectedIndex === activeIndex ? null : activeIndex;
            setSelectedIndex(next);
            onSelectChange?.(next);
          }
          break;
        case "h":
        case "H":
          if (activeIndex >= 0 && onHistory) {
            e.preventDefault();
            onHistory(activeIndex);
          }
          break;
        case "Escape":
          if (selectedIndex !== null) {
            e.preventDefault();
            clearSelection();
          }
          break;
        default:
          break;
      }
    },
    [enabled, rowCount, activeIndex, selectedIndex, move, onEnter, onHistory, onSelectChange, clearSelection]
  );

  return {
    activeIndex,
    selectedIndex,
    setActiveIndex,
    clearSelection,
    registerRow,
    containerProps: {
      // A focusable wrapper around a native <table>. We intentionally do NOT
      // claim role="grid" — that would promise the full ARIA grid widget
      // pattern (active-descendant, gridcell roles) which we don't implement.
      // "group" + aria-label keeps native table semantics intact for SRs.
      tabIndex: 0,
      role: "group",
      onKeyDown,
      "aria-label": "Data table — use arrow keys to navigate rows",
    },
  };
}
