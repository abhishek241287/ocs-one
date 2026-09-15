import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  Activity,
  Archive,
  Battery,
  BatteryCharging,
  BookOpen,
  Box,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  Cpu,
  Download,
  Factory,
  FlaskConical,
  GitBranch,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Minus,
  Network,
  Package,
  PackageCheck,
  PackagePlus,
  Pin,
  Plug,
  QrCode,
  Settings,
  ShieldCheck,
  ShieldHalf,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  Tags,
  TrendingUp,
  Truck,
  UserPlus,
  UserRoundCog,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavItem = { label: string; href: string; icon: any; ownerOnly?: boolean; pinnable?: boolean };
type NavGroup = { label: string; items: NavItem[]; directorOnly?: boolean };
type NavSection = {
  title: string;
  items?: NavItem[];
  groups?: NavGroup[];
  directorOnly?: boolean;
  dividerBefore?: boolean;
  workspaceUtility?: boolean;
};

const navSections: NavSection[] = [
  {
    title: "Command",
    workspaceUtility: true,
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "My Work",
    workspaceUtility: true,
    items: [{ label: "My Tasks", href: "/dashboard#my-work", icon: ListTodo, pinnable: false }],
  },
  {
    title: "Operations",
    dividerBefore: true,
    groups: [
      {
        label: "Production",
        items: [
          { label: "Receive From Inventory", href: "/cells/receiving", icon: Package },
          { label: "Cell Grading", href: "/cells/grading", icon: FlaskConical },
          { label: "Cell Matching", href: "/cells/matching", icon: BrainCircuit },
          { label: "Cell Inventory", href: "/cells/inventory", icon: Archive },
          { label: "Production Orders", href: "/manufacturing/orders", icon: Factory },
          { label: "Charging", href: "/manufacturing/charging-dashboard", icon: Zap },
          { label: "Testing", href: "/manufacturing/testing-dashboard", icon: FlaskConical },
          { label: "Rework", href: "/manufacturing/rework", icon: Wrench },
        ],
      },
      {
        label: "Inventory",
        items: [
          { label: "Stock On Hand", href: "/inventory/stock", icon: Package },
          { label: "Product Inventory", href: "/product-inventory", icon: Boxes },
        ],
      },
      {
        label: "Quality",
        items: [
          { label: "QC", href: "/manufacturing/orders?stage=quality_control", icon: ShieldCheck },
        ],
      },
      {
        label: "Logistics",
        items: [
          { label: "Packing", href: "/fulfillment/packing", icon: PackageCheck },
          { label: "Packing Dashboard", href: "/logistics/packing-dashboard", icon: Package },
        ],
      },
      {
        label: "Traceability",
        items: [{ label: "Product Traceability", href: "/traceability", icon: QrCode }],
      },
    ],
  },
  {
    title: "Supply Chain",
    groups: [
      {
        label: "Procurement",
        items: [{ label: "Purchase Orders", href: "/procurement/purchase-orders", icon: ShoppingCart }],
      },
      {
        label: "Receiving",
        items: [
          { label: "Goods Receipt", href: "/inventory/grns", icon: Archive },
          { label: "Incoming Inspection", href: "/inventory/inspections", icon: ClipboardCheck },
        ],
      },
    ],
  },
  {
    title: "Sales",
    groups: [
      {
        label: "Dealers",
        items: [
          { label: "Dealer Portal", href: "/fulfillment/dealers", icon: Store },
          { label: "Dealer Master", href: "/logistics/dealers", icon: Store },
        ],
      },
      {
        label: "Dispatch",
        items: [
          { label: "Dispatch", href: "/fulfillment/dispatch", icon: Truck },
          { label: "All Dispatches", href: "/fulfillment/dispatch/list", icon: ListChecks },
          {
            label: "Dispatch Orders",
            href: "/logistics/dispatch-orders",
            icon: Truck,
            ownerOnly: true,
          },
        ],
      },
      {
        label: "Customers",
        items: [
          { label: "Customer Registration", href: "/after-sales/registrations", icon: UserPlus },
          { label: "Warranty", href: "/after-sales/warranties", icon: ShieldHalf },
        ],
      },
    ],
  },
  {
    title: "Master Data",
    groups: [
      {
        label: "Materials",
        items: [
          { label: "Material Master", href: "/masters/materials", icon: Package },
          { label: "Material Categories", href: "/masters/material-categories", icon: Tags },
          { label: "Cell Master", href: "/masters/cells", icon: Battery },
          { label: "BMS Master", href: "/masters/bms", icon: Cpu },
          { label: "Connector Master", href: "/masters/connectors", icon: Plug },
          { label: "Cable Master", href: "/masters/cables", icon: Zap },
          { label: "Busbar Master", href: "/masters/busbars", icon: Minus },
          { label: "Cabinet Master", href: "/masters/cabinets", icon: Box },
        ],
      },
      {
        label: "Products",
        items: [
          { label: "Product Master", href: "/masters/products", icon: BookOpen },
          { label: "Product Categories", href: "/masters/product-categories", icon: Layers },
          { label: "Imported Product Registration", href: "/products/imported", icon: PackagePlus },
        ],
      },
      {
        label: "Suppliers",
        items: [{ label: "Supplier Master", href: "/masters/suppliers", icon: Factory }],
      },
      {
        label: "BOM",
        items: [{ label: "Bill of Materials", href: "/masters/boms", icon: ListChecks }],
      },
      {
        label: "Equipment",
        items: [
          { label: "Charger Master", href: "/masters/chargers", icon: BatteryCharging },
          { label: "Test Equipment", href: "/masters/test-equipment", icon: FlaskConical },
        ],
      },
    ],
  },
  {
    title: "Analytics",
    groups: [
      {
        label: "Reports",
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
    ],
  },
  {
    title: "Admin",
    groups: [
      {
        label: "Users",
        directorOnly: true,
        items: [{ label: "User Accounts", href: "/administration/users", icon: UserRoundCog }],
      },
      {
        label: "Workflows",
        items: [
          { label: "Workflow Assignment", href: "/inventory/workflow-assignments", icon: Network },
          { label: "Material Workflows", href: "/masters/material-workflows", icon: GitBranch },
          { label: "Product Workflows", href: "/masters/product-workflows", icon: GitBranch },
        ],
      },
      {
        label: "Configuration",
        items: [
          { label: "Grade Configuration", href: "/cells/config", icon: Settings },
          { label: "Charger Management", href: "/manufacturing/chargers", icon: BatteryCharging },
        ],
      },
    ],
  },
  {
    title: "Developer",
    directorOnly: true,
    groups: [
      {
        label: "Engineering",
        items: [
          { label: "Architecture Map", href: "/developer/architecture", icon: Network },
          { label: "Engineering Health", href: "/developer/performance", icon: Activity },
          { label: "Security Posture", href: "/developer/security", icon: ShieldCheck },
          { label: "Configuration", href: "/developer/configuration", icon: SlidersHorizontal },
        ],
      },
    ],
  },
];

const QUERY_OWNED_HREFS = navSections
  .flatMap((section) => [
    ...(section.items ?? []),
    ...(section.groups ?? []).flatMap((group) => group.items),
  ])
  .map((item) => item.href)
  .filter((href) => href.includes("?"));

const HASH_OWNED_HREFS = navSections
  .flatMap((section) => [
    ...(section.items ?? []),
    ...(section.groups ?? []).flatMap((group) => group.items),
  ])
  .map((item) => item.href)
  .filter((href) => href.includes("#"));

const SIDEBAR_SCROLL_KEY = "ocs.sidebar.scrollTop";
const SIDEBAR_OPEN_KEY = "ocs.sidebar.openSections";
const SIDEBAR_UTILITY_KEY = "ocs.sidebar.utilitySections";
const SIDEBAR_RECENT_KEY = "ocs.sidebar.recent";
const SIDEBAR_PINNED_KEY = "ocs.sidebar.pinned";

function readStringArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function readBooleanMap(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStorage(key: string, value: unknown) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function itemPath(href: string) {
  return href.split(/[?#]/, 1)[0];
}

function itemIsActive(item: NavItem, location: string, search: string) {
  const path = itemPath(item.href);
  const hrefHasQuery = item.href.includes("?");
  const hrefHasHash = item.href.includes("#");
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const fullPath = `${location}${search ? `?${search}` : ""}${hash}`;
  const claimedBySpecializedSibling =
    QUERY_OWNED_HREFS.includes(fullPath) || HASH_OWNED_HREFS.includes(fullPath);

  return hrefHasQuery || hrefHasHash
    ? fullPath === item.href
    : (location === path || location.startsWith(`${path}/`)) &&
        !(location === path && claimedBySpecializedSibling);
}

function itemIsVisible(item: NavItem, role?: string | null) {
  return !item.ownerOnly || role === "owner";
}

function groupIsVisible(group: NavGroup, role?: string | null) {
  return !group.directorOnly || role === "director" || role === "owner";
}

function collectItems(section: NavSection) {
  return [
    ...(section.items ?? []),
    ...(section.groups ?? []).flatMap((group) => group.items),
  ];
}

function NavItemLink({
  item,
  collapsed,
  location,
  search,
  isPinned,
  onVisit,
  onTogglePinned,
}: {
  item: NavItem;
  collapsed: boolean;
  location: string;
  search: string;
  isPinned: boolean;
  onVisit: (item: NavItem) => void;
  onTogglePinned: (href: string) => void;
}) {
  const Icon = item.icon;
  const isActive = itemIsActive(item, location, search);

  return (
    <li className="group/item">
      <div className="flex items-center gap-1">
        <Link
          href={item.href}
          onClick={() => onVisit(item)}
          className="min-w-0 flex-1"
        >
          <span
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              "cursor-pointer group-hover/item:bg-sidebar-accent group-hover/item:text-sidebar-accent-foreground",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-sidebar-foreground/70",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon size={18} className={cn("shrink-0", isActive && "text-primary")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </span>
        </Link>
        {!collapsed && item.pinnable !== false && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTogglePinned(item.href);
            }}
            className={cn(
              "mr-1 rounded p-1 text-sidebar-foreground/35 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              !isPinned && "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100",
            )}
            aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
            title={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
          >
            {isPinned ? <Star className="h-3.5 w-3.5 fill-current" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </li>
  );
}

function UtilityDisclosure({
  label,
  icon: Icon,
  collapsed,
  open,
  count,
  onToggle,
}: {
  label: string;
  icon: typeof Clock3;
  collapsed: boolean;
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
      title={collapsed ? label : undefined}
      aria-expanded={open}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {count > 0 && <span className="font-mono text-[10px] text-sidebar-foreground/45">{count}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </>
      )}
    </button>
  );
}

export function Sidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
}) {
  const [location] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const role = user?.role;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    readBooleanMap(SIDEBAR_OPEN_KEY),
  );
  const [utilityOpen, setUtilityOpen] = useState<Record<string, boolean>>(() =>
    readBooleanMap(SIDEBAR_UTILITY_KEY),
  );
  const [recentHrefs, setRecentHrefs] = useState(() => readStringArray(SIDEBAR_RECENT_KEY));
  const [pinnedHrefs, setPinnedHrefs] = useState(() => readStringArray(SIDEBAR_PINNED_KEY));

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved) el.scrollTop = parseInt(saved, 10) || 0;
  }, []);

  const visibleSections = useMemo(
    () =>
      role === "dealer"
        ? []
        : navSections.filter(
            (section) =>
              !section.directorOnly || role === "director" || role === "owner",
          ),
    [role],
  );

  const visibleItems = useMemo(
    () =>
      visibleSections
        .flatMap((section) => collectItems(section))
        .filter((item) => itemIsVisible(item, role)),
    [role, visibleSections],
  );
  const itemsByHref = useMemo(
    () => new Map(visibleItems.map((item) => [item.href, item])),
    [visibleItems],
  );
  const recentItems = recentHrefs.map((href) => itemsByHref.get(href)).filter(Boolean) as NavItem[];
  const pinnedItems = pinnedHrefs.map((href) => itemsByHref.get(href)).filter(Boolean) as NavItem[];

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(el.scrollTop));
  };

  const toggleSection = (title: string) => {
    setOpenSections((current) => {
      const next = { ...current, [title]: !(current[title] ?? true) };
      writeLocalStorage(SIDEBAR_OPEN_KEY, next);
      return next;
    });
  };

  const toggleUtility = (key: string) => {
    setUtilityOpen((current) => {
      const next = { ...current, [key]: !(current[key] ?? false) };
      writeLocalStorage(SIDEBAR_UTILITY_KEY, next);
      return next;
    });
  };

  const onVisit = (item: NavItem) => {
    const next = [item.href, ...recentHrefs.filter((href) => href !== item.href)].slice(0, 6);
    setRecentHrefs(next);
    writeLocalStorage(SIDEBAR_RECENT_KEY, next);
  };

  const onTogglePinned = (href: string) => {
    const next = pinnedHrefs.includes(href)
      ? pinnedHrefs.filter((value) => value !== href)
      : [href, ...pinnedHrefs].slice(0, 8);
    setPinnedHrefs(next);
    writeLocalStorage(SIDEBAR_PINNED_KEY, next);
  };

  const renderItem = (item: NavItem) => (
    <NavItemLink
      key={item.href}
      item={item}
      collapsed={collapsed}
      location={location}
      search={search}
      isPinned={pinnedHrefs.includes(item.href)}
      onVisit={onVisit}
      onTogglePinned={onTogglePinned}
    />
  );

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex w-full items-center gap-3 outline-none">
          <div className="shrink-0 rounded bg-primary p-1.5 text-primary-foreground">
            <Zap size={20} />
          </div>
          {!collapsed && (
            <span className="overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight">
              OCS One
            </span>
          )}
        </Link>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4">
        {visibleSections.map((section) => {
          const sectionItems = collectItems(section).filter((item) => itemIsVisible(item, role));
          const groups = (section.groups ?? []).filter((group) => groupIsVisible(group, role));
          const hasActive = sectionItems.some((item) => itemIsActive(item, location, search));
          const open = openSections[section.title] ?? true;
          const recentOpen = utilityOpen.recent ?? false;
          const pinnedOpen = utilityOpen.pinned ?? false;

          return (
            <div key={section.title}>
              {section.dividerBefore && !collapsed && (
                <div className="mx-4 mb-5 mt-1 border-t border-sidebar-border" aria-hidden="true" />
              )}
              <div className={cn("mb-5", section.workspaceUtility && "mb-1")}>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "mb-2 flex w-full items-center gap-2 px-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80",
                      section.workspaceUtility && "text-primary/80",
                    )}
                    aria-expanded={open}
                  >
                    <span className="min-w-0 flex-1 truncate">{section.title}</span>
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}

                {(open || collapsed || hasActive) && (
                  <div className="space-y-2 px-2">
                    {section.items && (
                      <ul className="space-y-1">{section.items.filter((item) => itemIsVisible(item, role)).map(renderItem)}</ul>
                    )}

                    {section.title === "My Work" && (
                      <div className="space-y-1">
                        <UtilityDisclosure
                          label="Recently Used"
                          icon={Clock3}
                          collapsed={collapsed}
                          open={recentOpen}
                          count={recentItems.length}
                          onToggle={() => toggleUtility("recent")}
                        />
                        {!collapsed && recentOpen && (
                          <ul className="space-y-1 border-l border-sidebar-border pl-2">
                            {recentItems.length > 0
                              ? recentItems.map(renderItem)
                              : <li className="px-3 py-1 text-[11px] text-sidebar-foreground/40">No recent destinations</li>}
                          </ul>
                        )}
                        <UtilityDisclosure
                          label="Pinned"
                          icon={Pin}
                          collapsed={collapsed}
                          open={pinnedOpen}
                          count={pinnedItems.length}
                          onToggle={() => toggleUtility("pinned")}
                        />
                        {!collapsed && pinnedOpen && (
                          <ul className="space-y-1 border-l border-sidebar-border pl-2">
                            {pinnedItems.length > 0
                              ? pinnedItems.map(renderItem)
                              : <li className="px-3 py-1 text-[11px] text-sidebar-foreground/40">No pinned destinations</li>}
                          </ul>
                        )}
                      </div>
                    )}

                    {groups.map((group) => {
                      const items = group.items.filter((item) => itemIsVisible(item, role));
                      if (items.length === 0) return null;
                      return (
                        <div key={group.label} className="space-y-1">
                          {!collapsed && (
                            <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-sidebar-foreground/35">
                              {group.label}
                            </div>
                          )}
                          <ul className="space-y-1">{items.map(renderItem)}</ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </Button>
      </div>
    </aside>
  );
}