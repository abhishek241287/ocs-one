import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Factory,
  Package,
  Battery,
  ShieldCheck,
  QrCode,
  Truck,
  Wrench,
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
  TrendingUp,
  Download,
  BrainCircuit,
  Network,
  Activity,
  ClipboardCheck,
  SlidersHorizontal,
  Layers,
  GitBranch,
  Tags,
  Boxes,
  PackageCheck,
  Store,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavItem = { label: string; href: string; icon: any };
type NavGroup = { label: string; items: NavItem[] };
type NavSection = {
  title: string;
  items?: NavItem[];
  groups?: NavGroup[];
  collapsible?: boolean;
  directorOnly?: boolean;
};

const navSections: NavSection[] = [
  {
    title: "Dashboard",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Inventory",
    groups: [
      {
        label: "Raw Material",
        items: [
          { label: "Goods Receipt", href: "/inventory/grns", icon: Archive },
          { label: "Incoming Inspection", href: "/inventory/inspections", icon: ClipboardCheck },
          { label: "Stock On Hand", href: "/inventory/stock", icon: Package },
        ],
      },
      {
        label: "Finished Goods",
        items: [{ label: "Product Inventory", href: "/product-inventory", icon: Boxes }],
      },
    ],
  },
  {
    title: "Production",
    groups: [
      {
        label: "Cell Processing",
        items: [
          { label: "Cell Receiving", href: "/cells/receiving", icon: Package },
          { label: "Cell Grading", href: "/cells/grading", icon: FlaskConical },
          { label: "Cell Matching", href: "/cells/matching", icon: BrainCircuit },
          { label: "Cell Inventory", href: "/cells/inventory", icon: Archive },
        ],
      },
      {
        label: "Manufacturing",
        items: [
          { label: "Production Orders", href: "/manufacturing/orders", icon: Factory },
          { label: "Charging", href: "/manufacturing/charging-dashboard", icon: Zap },
          { label: "Testing", href: "/manufacturing/testing-dashboard", icon: FlaskConical },
          { label: "Rework", href: "/manufacturing/rework", icon: Wrench },
        ],
      },
      {
        label: "Quality",
        items: [
          { label: "QC", href: "/manufacturing/orders", icon: ShieldCheck },
          { label: "Product Traceability", href: "/products", icon: QrCode },
        ],
      },
    ],
  },
  {
    title: "Dispatch",
    items: [
      { label: "Packing", href: "/fulfillment/packing", icon: PackageCheck },
      { label: "Dispatch", href: "/fulfillment/dispatch", icon: Truck },
      { label: "All Dispatches", href: "/fulfillment/dispatch/list", icon: ListChecks },
      { label: "Dealer Portal", href: "/fulfillment/dealers", icon: Store },
      { label: "Packing Dashboard", href: "/logistics/packing-dashboard", icon: Package },
      { label: "Dispatch Orders", href: "/logistics/dispatch-orders", icon: Truck },
    ],
  },
  {
    title: "Masters",
    items: [
      { label: "Material Master", href: "/masters/materials", icon: Package },
      { label: "Material Categories", href: "/masters/material-categories", icon: Tags },
      { label: "Supplier Master", href: "/masters/suppliers", icon: Factory },
      { label: "Dealer Master", href: "/logistics/dealers", icon: Store },
      { label: "Product Categories", href: "/masters/product-categories", icon: Layers },
      { label: "Cell Master", href: "/masters/cells", icon: Battery },
      { label: "BMS Master", href: "/masters/bms", icon: Cpu },
      { label: "Charger Master", href: "/masters/chargers", icon: BatteryCharging },
      { label: "Product Master", href: "/masters/products", icon: BookOpen },
      { label: "Connector Master", href: "/masters/connectors", icon: Plug },
      { label: "Cable Master", href: "/masters/cables", icon: Zap },
      { label: "Busbar Master", href: "/masters/busbars", icon: Minus },
      { label: "Cabinet Master", href: "/masters/cabinets", icon: Box },
      { label: "Test Equipment", href: "/masters/test-equipment", icon: FlaskConical },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Workflow Assignment", href: "/inventory/workflow-assignments", icon: Network },
      { label: "Material Workflows", href: "/masters/material-workflows", icon: GitBranch },
      { label: "Product Workflows", href: "/masters/product-workflows", icon: GitBranch },
      { label: "Grade Configuration", href: "/cells/config", icon: Settings },
      { label: "Charger Management", href: "/manufacturing/chargers", icon: BatteryCharging },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Executive Dashboard", href: "/reports/executive", icon: TrendingUp },
      { label: "Production Reports", href: "/reports/production", icon: Factory },
      { label: "Cell Analytics", href: "/reports/cells", icon: Battery },
      { label: "Quality Analytics", href: "/reports/quality", icon: ShieldCheck },
      { label: "Inventory Analytics", href: "/reports/inventory", icon: Archive },
      { label: "Logistics Analytics", href: "/reports/logistics", icon: Truck },
      { label: "Export Center", href: "/reports/export", icon: Download },
    ],
  },
  {
    title: "Developer",
    collapsible: true,
    directorOnly: true,
    items: [
      { label: "Architecture Map", href: "/developer/architecture", icon: Network },
      { label: "Engineering Health", href: "/developer/performance", icon: Activity },
      { label: "Security Posture", href: "/developer/security", icon: ShieldCheck },
      { label: "Configuration", href: "/developer/configuration", icon: SlidersHorizontal },
    ],
  },
];

function NavItemLink({
  item,
  collapsed,
  location,
}: {
  item: NavItem;
  collapsed: boolean;
  location: string;
}) {
  const Icon = item.icon;
  const isActive = location === item.href || location.startsWith(item.href + "/");
  return (
    <li>
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
}

function CollapsibleSection({
  section,
  collapsed,
  location,
}: {
  section: NavSection;
  collapsed: boolean;
  location: string;
}) {
  const items = section.items ?? [];
  const hasActive = items.some(
    (i) => location === i.href || location.startsWith(i.href + "/")
  );
  const [open, setOpen] = useState(hasActive);

  if (collapsed) {
    return (
      <ul className="space-y-1 px-2">
        {items.map((item) => (
          <NavItemLink key={item.label} item={item} collapsed={collapsed} location={location} />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 mb-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
      >
        <span className="uppercase tracking-wider font-semibold flex-1 text-left">
          {section.title}
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ul className="space-y-1 px-2">
          {items.map((item) => (
            <NavItemLink key={item.label} item={item} collapsed={collapsed} location={location} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (val: boolean) => void }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const visibleSections = navSections.filter(
    (section) => !section.directorOnly || user?.role === "director"
  );

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
        {visibleSections.map((section, idx) => (
          <div key={section.title} className={cn("mb-6", idx === visibleSections.length - 1 && "mb-0")}>
            {section.collapsible ? (
              <CollapsibleSection section={section} collapsed={collapsed} location={location} />
            ) : (
              <>
                {!collapsed && (
                  <h4 className="px-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
                    {section.title}
                  </h4>
                )}
                {section.groups ? (
                  section.groups.map((group) => (
                    <div key={group.label} className="mb-3 last:mb-0">
                      {!collapsed && (
                        <h5 className="px-4 text-[11px] font-medium text-sidebar-foreground/40 mb-1">
                          {group.label}
                        </h5>
                      )}
                      <ul className="space-y-1 px-2">
                        {group.items.map((item) => (
                          <NavItemLink key={item.label} item={item} collapsed={collapsed} location={location} />
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul className="space-y-1 px-2">
                    {(section.items ?? []).map((item) => (
                      <NavItemLink key={item.label} item={item} collapsed={collapsed} location={location} />
                    ))}
                  </ul>
                )}
              </>
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
