import { forwardRef, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OdsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onDebouncedChange?: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
  className?: string;
  /** Enable Ctrl+F to focus this search bar */
  captureCtrlF?: boolean;
  autoFocus?: boolean;
}

export const OdsSearchBar = forwardRef<HTMLInputElement, OdsSearchBarProps>(
  (
    {
      value,
      onChange,
      onDebouncedChange,
      debounceMs = 350,
      placeholder = "Search…",
      className,
      captureCtrlF = false,
      autoFocus = false,
    },
    ref
  ) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) ?? inputRef;

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        onChange(next);
        if (onDebouncedChange) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => onDebouncedChange(next), debounceMs);
        }
      },
      [onChange, onDebouncedChange, debounceMs]
    );

    const handleClear = () => {
      onChange("");
      if (onDebouncedChange) onDebouncedChange("");
      resolvedRef.current?.focus();
    };

    // ODS Standard 16 — keyboard escape: Esc clears the query and retains focus.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && value) {
        e.preventDefault();
        handleClear();
      }
    };

    useEffect(() => {
      if (!captureCtrlF) return;
      const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
          e.preventDefault();
          resolvedRef.current?.focus();
          resolvedRef.current?.select();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [captureCtrlF, resolvedRef]);

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    return (
      <div className={cn("relative flex items-center", className)}>
        <Search className="absolute left-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          ref={resolvedRef}
          type="search"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="pl-8 pr-8 h-9"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }
);
OdsSearchBar.displayName = "OdsSearchBar";
