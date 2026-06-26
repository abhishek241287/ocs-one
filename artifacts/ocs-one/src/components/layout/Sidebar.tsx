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
  Archive,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavItem = { label: string; href: string; icon: any };
type NavSection = {
  title: string;
  items?: NavItem[];
  groups?: { label: string; icon: any; items: NavItem[] }[];
};

const navSections: NavSection[] = [
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
    title: "Manufacturing",
    groups: [
      {
        label: "Cell Lifecycle",
        icon: Battery,
        items: [
          { label: "Cell Receiving", href: "/cells/receiving", icon: Package },
          { label: "Cell Grading", href: "/cells/grading", icon: FlaskConical },
          { label: "Cell Inventory", href: "/cells/inventory", icon: Archive },
          { label: "Cell Matching", href: "/cells/matching", icon: BrainCircuit },
          { label: "Grade Config", href: "/cells/config", icon: Settings },
        ],
      },
      {
        label: "Production",
        icon: Factory,
        items: [
          { label: "Production Orders", href: "/manufacturing/orders", icon: Factory },
          { label: "Charger Management", href: "/manufacturing/chargers", icon: BatteryCharging },
          { label: "Charging Dashboard", href: "/manufacturing/charging-dashboard", icon: Zap },
        ],
      },
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

function GroupedSection({
  group,
  collapsed,
  location,
}: {
  group: { label: string; icon: any; items: NavItem[] };
  collapsed: boolean;
  location: string;
}) {
  const hasActive = group.items.some((i) => location === i.href || location.startsWith(i.href + "/"));
  const [open, setOpen] = useState(hasActive);
  const GroupIcon = group.icon;

  if (collapsed) {
    return (
      <ul className="space-y-1 px-2">
        {group.items.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <li key={item.label}>
              <Link href={item.href}>
                <span
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer justify-center px-0",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  title={item.label}
                >
                  <Icon size={20} className={cn("shrink-0", isActive ? "text-primary" : "")} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-5 py-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground/80 transition-colors"
      >
        <GroupIcon size={13} />
        <span className="uppercase tracking-wider font-semibold flex-1 text-left">{group.label}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ul className="space-y-1 px-2">
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <li key={item.label}>
                <Link href={item.href}>
                  <span
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon size={18} className={cn("shrink-0 ml-1", isActive ? "text-primary" : "")} />
                    <span className="truncate text-sm">{item.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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

            {section.groups ? (
              <div className="space-y-2">
                {section.groups.map((group) => (
                  <GroupedSection
                    key={group.label}
                    group={group}
                    collapsed={collapsed}
                    location={location}
                  />
                ))}
              </div>
            ) : (
              <ul className="space-y-1 px-2">
                {(section.items ?? []).map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + "/");
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
            )}
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
