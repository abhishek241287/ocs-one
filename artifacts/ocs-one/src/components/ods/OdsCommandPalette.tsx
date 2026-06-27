/**
 * ODS Command Palette — Ctrl+K global navigation
 * Features: fuzzy search, navigation, quick actions, module jump
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface CommandEntry {
  id: string;
  label: string;
  group: string;
  icon?: string;
  keywords?: string[];
  href?: string;
  action?: () => void;
}

const NAVIGATION_COMMANDS: CommandEntry[] = [
  { id: "nav-dashboard", label: "Director Dashboard", group: "Navigate", icon: "📊", href: "/dashboard", keywords: ["home", "kpi", "director"] },
  { id: "nav-orders", label: "Production Orders", group: "Navigate", icon: "🏭", href: "/manufacturing/orders", keywords: ["manufacturing", "order", "mfg"] },
  { id: "nav-cell-receiving", label: "Cell Receiving", group: "Navigate", icon: "📦", href: "/cells/receiving", keywords: ["cell", "lot", "receive", "inbound"] },
  { id: "nav-cell-grading", label: "Cell Grading", group: "Navigate", icon: "🔬", href: "/cells/grading", keywords: ["grade", "grading", "measure"] },
  { id: "nav-cell-matching", label: "Cell Matching", group: "Navigate", icon: "🧠", href: "/cells/matching", keywords: ["match", "matching", "allocate"] },
  { id: "nav-cell-inventory", label: "Cell Inventory", group: "Navigate", icon: "📋", href: "/cells/inventory", keywords: ["inventory", "stock", "cells"] },
  { id: "nav-dealers", label: "Dealer Master", group: "Navigate", icon: "🏢", href: "/logistics/dealers", keywords: ["dealer", "customer"] },
  { id: "nav-dispatch", label: "Dispatch Orders", group: "Navigate", icon: "🚚", href: "/logistics/dispatch-orders", keywords: ["dispatch", "shipment", "delivery"] },
  { id: "nav-packing", label: "Packing Dashboard", group: "Navigate", icon: "📦", href: "/logistics/packing-dashboard", keywords: ["packing", "pack"] },
  { id: "nav-products", label: "Product Master", group: "Navigate", icon: "🔋", href: "/masters/products", keywords: ["product", "master", "battery"] },
  { id: "nav-bms", label: "BMS Master", group: "Navigate", icon: "💡", href: "/masters/bms", keywords: ["bms", "battery management"] },
  { id: "nav-cells-master", label: "Cell Master", group: "Navigate", icon: "⚡", href: "/masters/cells", keywords: ["cell master"] },
  { id: "nav-chargers", label: "Charger Master", group: "Navigate", icon: "🔌", href: "/masters/chargers", keywords: ["charger"] },
  { id: "nav-busbars", label: "Busbar Master", group: "Navigate", icon: "🔩", href: "/masters/busbars", keywords: ["busbar"] },
  { id: "nav-connectors", label: "Connector Master", group: "Navigate", icon: "🔗", href: "/masters/connectors", keywords: ["connector"] },
  { id: "nav-cables", label: "Cable Master", group: "Navigate", icon: "🧵", href: "/masters/cables", keywords: ["cable"] },
  { id: "nav-cabinets", label: "Cabinet Master", group: "Navigate", icon: "📦", href: "/masters/cabinets", keywords: ["cabinet"] },
  { id: "nav-test-equipment", label: "Test Equipment Master", group: "Navigate", icon: "🔬", href: "/masters/test-equipment", keywords: ["test", "equipment"] },
  { id: "nav-report-exec", label: "Executive Dashboard", group: "Reports", icon: "📈", href: "/reports/executive", keywords: ["report", "executive", "analytics"] },
  { id: "nav-report-production", label: "Production Report", group: "Reports", icon: "📊", href: "/reports/production", keywords: ["production report"] },
  { id: "nav-report-cells", label: "Cell Analytics", group: "Reports", icon: "🔬", href: "/reports/cells", keywords: ["cell analytics"] },
  { id: "nav-report-quality", label: "Quality Analytics", group: "Reports", icon: "✅", href: "/reports/quality", keywords: ["quality"] },
  { id: "nav-report-logistics", label: "Logistics Analytics", group: "Reports", icon: "🚚", href: "/reports/logistics", keywords: ["logistics"] },
  { id: "nav-report-export", label: "Export Center", group: "Reports", icon: "💾", href: "/reports/export", keywords: ["export"] },
  { id: "nav-charging", label: "Charging Dashboard", group: "Navigate", icon: "⚡", href: "/manufacturing/charging-dashboard", keywords: ["charging"] },
  { id: "nav-testing", label: "Testing Dashboard", group: "Navigate", icon: "🧪", href: "/manufacturing/testing-dashboard", keywords: ["testing"] },
  { id: "nav-rework", label: "Rework Queue", group: "Navigate", icon: "🔄", href: "/manufacturing/rework", keywords: ["rework"] },
  { id: "nav-design-system",   label: "Design System",    group: "Developer", icon: "🎨", href: "/design-system",           keywords: ["ods", "design", "components", "ui"] },
  { id: "nav-architecture",    label: "Architecture Map",  group: "Developer", icon: "🗺️", href: "/developer/architecture",   keywords: ["architecture", "dependency", "map", "modules", "api", "db"] },
];

function fuzzyMatch(query: string, text: string, keywords?: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const targets = [text.toLowerCase(), ...(keywords ?? []).map((k) => k.toLowerCase())];
  return targets.some((t) => t.includes(q));
}

interface OdsCommandPaletteProps {
  /** Extra commands registered by individual pages */
  extraCommands?: CommandEntry[];
}

export function OdsCommandPalette({ extraCommands = [] }: OdsCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const allCommands = [...NAVIGATION_COMMANDS, ...extraCommands];

  const filtered = query
    ? allCommands.filter((c) => fuzzyMatch(query, c.label, c.keywords))
    : allCommands;

  const grouped = filtered.reduce<Record<string, CommandEntry[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  const run = useCallback(
    (cmd: CommandEntry) => {
      setOpen(false);
      setQuery("");
      if (cmd.href) navigate(cmd.href);
      else if (cmd.action) cmd.action();
    },
    [navigate]
  );

  return (
    <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search modules, reports, masters…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
          {Object.entries(grouped).map(([group, items], i) => (
            <div key={group}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={cmd.id}
                    onSelect={() => run(cmd)}
                    className="gap-2 cursor-pointer"
                  >
                    {cmd.icon && <span className="text-base">{cmd.icon}</span>}
                    <span>{cmd.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
      <div className="border-t px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">↑↓</kbd>{" "}
          navigate &nbsp;
          <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">↵</kbd>{" "}
          open &nbsp;
          <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">Esc</kbd>{" "}
          close
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Ctrl</kbd>
          {" + "}
          <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px]">K</kbd>
        </span>
      </div>
    </CommandDialog>
  );
}
