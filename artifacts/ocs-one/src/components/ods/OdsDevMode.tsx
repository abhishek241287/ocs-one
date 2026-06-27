/**
 * ODS Developer Mode
 * Admin-only overlay showing route, component, API endpoint, query key, cert status.
 * Toggle: Ctrl+Shift+D or via the user menu DevMode button.
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { X, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Context ─────────────────────────────────────────────────────────────────

interface DevModeContext {
  enabled: boolean;
  toggle: () => void;
  setPageInfo: (info: DevModePageInfo) => void;
  pageInfo: DevModePageInfo | null;
}

export interface DevModePageInfo {
  component?: string;
  apiEndpoints?: string[];
  queryKeys?: string[];
  certStatus?: "certified" | "under-validation" | "development";
  moduleVersion?: string;
}

const DevModeCtx = createContext<DevModeContext>({
  enabled: false,
  toggle: () => undefined,
  setPageInfo: () => undefined,
  pageInfo: null,
});

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("ocs_devmode") === "1"; } catch { return false; }
  });
  const [pageInfo, setPageInfo] = useState<DevModePageInfo | null>(null);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      try { localStorage.setItem("ocs_devmode", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <DevModeCtx.Provider value={{ enabled, toggle, setPageInfo, pageInfo }}>
      {children}
      {enabled && <DevModeOverlay />}
    </DevModeCtx.Provider>
  );
}

export function useDevMode() {
  return useContext(DevModeCtx);
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

function DevModeOverlay() {
  const { toggle, pageInfo } = useContext(DevModeCtx);
  const [location] = useLocation();
  const [minimized, setMinimized] = useState(false);

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[9999] font-mono text-xs bg-gray-900 text-green-400",
        "border border-green-700 rounded-lg shadow-xl transition-all",
        minimized ? "w-auto p-2" : "w-72 p-3"
      )}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5 text-green-500" />
          <span className="text-green-300 font-semibold">DEV MODE</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMinimized((v) => !v)}
            className="text-gray-500 hover:text-gray-300 text-xs px-1"
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? "▲" : "▼"}
          </button>
          <button onClick={toggle} className="text-gray-500 hover:text-red-400" title="Close dev mode">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="space-y-1 border-t border-green-900 pt-2 mt-1">
          <DevRow label="Route" value={location} />
          {pageInfo?.component && <DevRow label="Component" value={pageInfo.component} />}
          {pageInfo?.apiEndpoints?.map((ep, i) => (
            <DevRow key={i} label={i === 0 ? "API" : ""} value={ep} />
          ))}
          {pageInfo?.queryKeys?.map((qk, i) => (
            <DevRow key={i} label={i === 0 ? "Query Key" : ""} value={qk} />
          ))}
          {pageInfo?.certStatus && (
            <DevRow label="Cert" value={pageInfo.certStatus} highlight />
          )}
          {pageInfo?.moduleVersion && (
            <DevRow label="Version" value={pageInfo.moduleVersion} />
          )}
          <div className="pt-1 text-gray-600 text-[10px]">
            Ctrl+Shift+D to toggle
          </div>
        </div>
      )}
    </div>
  );
}

function DevRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2 leading-tight">
      <span className="text-gray-500 w-20 shrink-0 text-right">{label}</span>
      <span className={cn("text-green-400 break-all", highlight && "text-yellow-400")}>{value}</span>
    </div>
  );
}
