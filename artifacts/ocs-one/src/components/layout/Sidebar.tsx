import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Factory,
  Package,
  Battery,
  ShieldCheck,
  QrCode,
  Truck,
  FileCheck,
  Wrench,
  BarChart3,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Zap,
  BookOpen,
  Cpu,
  Box,
  Plug,
  Minus,
  BatteryCharging,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navSections = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Engineering Masters",
    items: [
      { label: "Product Master", href: "/masters/products", icon: BookOpen },
      { label: "Cell Master", href: "/masters/cells", icon: Battery },
      { label: "BMS Master", href: "/masters/bms", icon: Cpu },
      { label: "Cabinet Master", href: "/masters/cabinets", icon: Box },
      { label: "Connector Master", href: "/masters/connectors", icon: Plug },
      { label: "Cable Master", href: "/masters/cables", icon: Zap },
      { label: "Busbar Master", href: "/masters/busbars", icon: Minus },
      { label: "Charger Master", href: "/masters/chargers", icon: BatteryCharging },
      { label: "Test Equipment", href: "/masters/test-equipment", icon: FlaskConical },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Manufacturing", href: "#manufacturing", icon: Factory },
      { label: "Inventory", href: "#inventory", icon: Package },
      { label: "Cell Grading", href: "#cell-grading", icon: Battery },
      { label: "Quality Control", href: "#qc", icon: ShieldCheck },
    ],
  },
  {
    title: "Traceability",
    items: [
      { label: "QR Traceability", href: "#qr", icon: QrCode },
      { label: "Dispatch", href: "#dispatch", icon: Truck },
    ],
  },
  {
    title: "After-Sales",
    items: [
      { label: "Warranty", href: "#warranty", icon: FileCheck },
      { label: "Service", href: "#service", icon: Wrench },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "AI Assistant", href: "#ai", icon: BrainCircuit },
    ],
  },
];

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (val: boolean) => void }) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center px-4 border-b border-sidebar-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 w-full outline-none">
          <div className="bg-primary text-primary-foreground p-1.5 rounded shrink-0">
            <Zap size={20} />
          </div>
          {!collapsed && (
            <span className="font-semibold text-lg tracking-tight whitespace-nowrap overflow-hidden">
              OCS One
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {navSections.map((section, idx) => (
          <div key={section.title} className={cn("mb-6", idx === navSections.length - 1 && "mb-0")}>
            {!collapsed && (
              <h4 className="px-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
                {section.title}
              </h4>
            )}
            <ul className="space-y-1 px-2">
              {section.items.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link href={item.href}>
                      <span
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          collapsed && "justify-center px-0"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon size={20} className={cn("shrink-0", isActive ? "text-primary" : "")} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-sidebar-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </Button>
      </div>
    </aside>
  );
}
