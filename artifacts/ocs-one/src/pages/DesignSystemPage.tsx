/**
 * ODS Component Showcase — /design-system
 * Internal catalogue of every ODS component.
 */
import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { ModuleHeader } from "@/components/ods/ModuleHeader";
import { OdsCertBadge } from "@/components/ods/OdsCertBadge";
import { OdsStatusBadge } from "@/components/ods/OdsStatusBadge";
import { OdsEmptyState } from "@/components/ods/OdsEmptyState";
import { OdsTableSkeleton } from "@/components/ods/OdsTableSkeleton";
import { OdsSearchBar } from "@/components/ods/OdsSearchBar";
import { OdsToolbar } from "@/components/ods/OdsToolbar";
import { OdsDrawer } from "@/components/ods/OdsDrawer";
import { OdsDialog } from "@/components/ods/OdsDialog";
import { OdsDataTable } from "@/components/ods/OdsDataTable";
import {
  OdsMetricCard, OdsMetricGrid,
  OdsChartCard,
  OdsTimeline, type OdsTimelineItem,
  OdsStepper, type OdsStep,
} from "@/components/ods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnDef } from "@tanstack/react-table";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ods } from "@/ods/theme";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Factory, ShieldCheck,
  Zap, Activity,
} from "lucide-react";

// ── Sample data ────────────────────────────────────────────────────────────

interface SampleRow {
  id: string;
  name: string;
  status: string;
  type: string;
  amount: number;
}

const SAMPLE_DATA: SampleRow[] = [
  { id: "1", name: "OCS 48V 280Ah Pack",  status: "active",   type: "Energy Storage", amount: 85000 },
  { id: "2", name: "OCS 24V 150Ah Pack",  status: "inactive", type: "Battery",        amount: 42000 },
  { id: "3", name: "BMS-16S-A100",         status: "active",   type: "BMS",            amount: 8500  },
  { id: "4", name: "Charger CHG-50A",      status: "active",   type: "Charger",        amount: 12000 },
  { id: "5", name: "Test Equip TE-01",     status: "inactive", type: "Equipment",      amount: 35000 },
];

const SAMPLE_COLS: ColumnDef<SampleRow>[] = [
  { accessorKey: "name",   header: "Name" },
  { accessorKey: "type",   header: "Type" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <OdsStatusBadge status={row.original.status} /> },
  { accessorKey: "amount", header: "Amount",  cell: ({ row }) => `₹${row.original.amount.toLocaleString()}` },
];

const DEMO_TIMELINE_ITEMS: OdsTimelineItem[] = [
  { id: "1", title: "Order Released",         description: "Production order MFG-2026-001 released to floor.", timestamp: new Date(Date.now() - 3600000 * 5), user: "Abhishek", color: "info",    icon: "🚀" },
  { id: "2", title: "Assembly Completed",      description: "Cell stack assembled and torqued to spec.",        timestamp: new Date(Date.now() - 3600000 * 3), user: "Rajan",    color: "success", icon: "🔧" },
  { id: "3", title: "BMS Programming Failed",  description: "Firmware flash timeout on port COM3.",            timestamp: new Date(Date.now() - 3600000 * 2), user: "Vikram",   color: "error",   icon: "❌" },
  { id: "4", title: "BMS Reprogrammed",        description: "Successfully flashed v4.2.1 firmware.",           timestamp: new Date(Date.now() - 3600000),     user: "Vikram",   color: "success", icon: "✅" },
  { id: "5", title: "Charging Started",        description: "Formation charge cycle initiated.",                timestamp: new Date(),                          user: "Operator", color: "default", icon: "⚡", status: "Active" },
];

const DEMO_STEPPER_STEPS: OdsStep[] = [
  { id: "cell_alloc",    label: "Cell Allocation",  status: "completed", timestamp: new Date(Date.now() - 86400000 * 2) },
  { id: "assembly",      label: "Assembly",          status: "completed", timestamp: new Date(Date.now() - 86400000) },
  { id: "compression",   label: "Compression",       status: "completed", timestamp: new Date(Date.now() - 3600000 * 6) },
  { id: "bms_install",   label: "BMS Install",       status: "active",    description: "Flashing firmware v4.2.1" },
  { id: "charging",      label: "Charging",          status: "pending" },
  { id: "testing",       label: "Testing",           status: "locked" },
  { id: "qc",            label: "Quality Control",   status: "locked" },
];

const DISPATCH_STEPS: OdsStep[] = [
  { id: "draft",      label: "Draft",      status: "completed" },
  { id: "confirmed",  label: "Confirmed",  status: "completed" },
  { id: "loaded",     label: "Loaded",     status: "active"    },
  { id: "in_transit", label: "In Transit", status: "pending"   },
  { id: "delivered",  label: "Delivered",  status: "pending"   },
];

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-4">
      <div className="flex items-center gap-3">
        <h2 className={cn(ods.typography.heading.h3, "border-b pb-2 flex-1")}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TokenSwatch({ label, classes }: { label: string; classes: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-7 w-32 rounded border", classes)} />
      <code className="text-xs font-mono text-gray-600">{label}</code>
    </div>
  );
}

// ── Simple bar chart using divs (no external charting lib needed) ──────────

function SimpleBarChart() {
  const bars = [
    { label: "Mon", value: 12 }, { label: "Tue", value: 19 },
    { label: "Wed", value: 8  }, { label: "Thu", value: 24 },
    { label: "Fri", value: 17 }, { label: "Sat", value: 6  },
  ];
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-3 h-full px-4 pb-4 pt-2">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-[10px] text-slate-500 font-medium">{b.value}</span>
          <div
            className="w-full rounded-t bg-primary/70 transition-all"
            style={{ height: `${(b.value / max) * 80}%` }}
          />
          <span className="text-[10px] text-slate-400">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const notify = useOdsNotify();
  const [search, setSearch]               = useState("");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [dialogVariant, setDialogVariant] = useState<"default" | "danger" | "warning" | "confirm">("danger");
  const [showSkeleton, setShowSkeleton]   = useState(false);
  const [showEmpty, setShowEmpty]         = useState(false);
  const [chartLoading, setChartLoading]   = useState(false);
  const [chartEmpty, setChartEmpty]       = useState(false);
  const [selectedStep, setSelectedStep]   = useState<string | undefined>("bms_install");

  const sections = [
    "Tokens", "Typography", "Badges", "Status", "Toolbar", "Search",
    "Tables", "Focus Management", "Skeletons", "Empty States", "Dialogs", "Drawers", "Notifications",
    "Metric Cards", "Chart Card", "Timeline", "Stepper", "Page Layout",
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-8 max-w-5xl">
        <ModuleHeader
          icon="🎨"
          title="OCS Design System"
          description="Internal component catalogue — every ODS component demonstrated here"
          certification="certified"
        />

        {/* Nav */}
        <nav className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border">
          {sections.map((s) => (
            <a
              key={s}
              href={`#${s.toLowerCase().replace(/ /g, "-")}`}
              className="text-xs px-2.5 py-1 rounded-md bg-white border text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors"
            >
              {s}
            </a>
          ))}
        </nav>

        {/* ── Design Tokens ── */}
        <Section id="tokens" title="Design Tokens">
          <p className={cn(ods.typography.body.muted, "mb-3")}>
            Semantic color tokens. Import from <code className={ods.typography.code}>@/ods/theme</code>.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Status — Success</p>
              <TokenSwatch label="ods.colors.status.success.bg" classes={ods.colors.status.success.bg} />
              <TokenSwatch label="dot" classes={`${ods.colors.status.success.dot} h-4 w-4 rounded-full`} />
            </div>
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Status — Warning</p>
              <TokenSwatch label="ods.colors.status.warning.bg" classes={ods.colors.status.warning.bg} />
              <TokenSwatch label="dot" classes={`${ods.colors.status.warning.dot} h-4 w-4 rounded-full`} />
            </div>
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Status — Error</p>
              <TokenSwatch label="ods.colors.status.error.bg" classes={ods.colors.status.error.bg} />
              <TokenSwatch label="dot" classes={`${ods.colors.status.error.dot} h-4 w-4 rounded-full`} />
            </div>
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Surface — Card</p>
              <div className={cn("h-10 flex items-center justify-center text-xs text-gray-500", ods.colors.surface.card)}>
                ods.colors.surface.card
              </div>
            </div>
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Surface — Panel</p>
              <div className={cn("h-10 flex items-center justify-center text-xs text-gray-500", ods.colors.surface.panel)}>
                ods.colors.surface.panel
              </div>
            </div>
            <div className="space-y-2">
              <p className={ods.typography.label.section}>Brand — Primary</p>
              <div className={cn("h-10 flex items-center justify-center text-xs text-white rounded-lg", ods.colors.brand.primaryBg)}>
                ods.colors.brand.primaryBg
              </div>
            </div>
          </div>
        </Section>

        {/* ── Typography ── */}
        <Section id="typography" title="Typography">
          <div className="space-y-3 bg-white border rounded-lg p-5">
            <p className={ods.typography.heading.h1}>H1 — Page Title (text-2xl font-bold)</p>
            <p className={ods.typography.heading.h2}>H2 — Section Heading (text-xl font-semibold)</p>
            <p className={ods.typography.heading.h3}>H3 — Subsection (text-lg font-semibold)</p>
            <p className={ods.typography.body.lg}>Body Large — text-base text-gray-700</p>
            <p className={ods.typography.body.md}>Body Medium — text-sm text-gray-700</p>
            <p className={ods.typography.body.muted}>Muted — text-sm text-gray-500</p>
            <p className={ods.typography.label.section}>LABEL SECTION — text-xs uppercase tracking</p>
            <code className={ods.typography.code}>ods.typography.code — monospace badge style</code>
            <p className={ods.typography.mono.semibold}>MFG-2026-0001 — mono semibold for IDs</p>
          </div>
        </Section>

        {/* ── Cert Badges ── */}
        <Section id="badges" title="Cert Badges">
          <div className="flex gap-3 flex-wrap">
            <OdsCertBadge level="certified" />
            <OdsCertBadge level="under-validation" />
            <OdsCertBadge level="development" />
          </div>
        </Section>

        {/* ── Status Badges ── */}
        <Section id="status" title="Status Badges">
          <div className="flex gap-2 flex-wrap">
            {[
              "active", "inactive", "completed", "in_progress", "pending", "draft",
              "released", "approved", "rejected", "failed", "cancelled", "delivered",
              "confirmed", "loaded", "in_transit", "received", "allocated", "reserved", "passed",
            ].map((s) => (
              <OdsStatusBadge key={s} status={s} />
            ))}
          </div>
        </Section>

        {/* ── Toolbar ── */}
        <Section id="toolbar" title="OdsToolbar">
          <OdsToolbar
            search={{ value: search, onChange: setSearch, placeholder: "Search components…" }}
            onRefresh={() => notify.info("Refreshed")}
            actions={<Button size="sm">+ New</Button>}
          />
        </Section>

        {/* ── Search ── */}
        <Section id="search" title="OdsSearchBar">
          <div className="space-y-2 max-w-sm">
            <OdsSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Type to search… (Ctrl+F)"
              captureCtrlF
            />
            <p className={ods.typography.body.muted}>Value: "{search}"</p>
          </div>
        </Section>

        {/* ── Data Table ── */}
        <Section id="tables" title="OdsDataTable">
          <div className="flex gap-2 mb-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowSkeleton((v) => !v)}>Toggle Loading</Button>
            <Button size="sm" variant="outline" onClick={() => setShowEmpty((v) => !v)}>Toggle Empty</Button>
          </div>
          <OdsDataTable
            data={showEmpty ? [] : SAMPLE_DATA}
            columns={SAMPLE_COLS}
            isLoading={showSkeleton}
            emptyIcon="📋"
            emptyTitle="No data"
            emptyDescription="This table has no rows."
            enableDensity
            enableColumnVisibility
            enableSorting
            getRowId={(r) => r.id}
          />
          <div className="mt-3 rounded-md border bg-gray-50 p-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-800 mb-1">
              ODS Standard 15 — Keyboard Table Navigation (mandatory)
            </p>
            <p className="mb-2">
              Click a table to focus it, then operate entirely from the keyboard. Every ODS data
              table supports this automatically via <code>useTableKeyboardNav</code>.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
              <li><kbd>↑</kbd> / <kbd>↓</kbd> — move between rows</li>
              <li><kbd>Home</kbd> / <kbd>End</kbd> — first / last row</li>
              <li><kbd>Enter</kbd> — open / edit the active record</li>
              <li><kbd>H</kbd> — open history (where available)</li>
              <li><kbd>Space</kbd> — select the active row</li>
              <li><kbd>Esc</kbd> — clear selection</li>
            </ul>
          </div>
        </Section>

        {/* ── Focus Management (Standard 16) ── */}
        <Section id="focus-management" title="Focus Management">
          <div className="rounded-md border bg-blue-50/60 p-4 text-sm text-gray-700 space-y-3">
            <p className="font-semibold text-gray-900">
              ODS Standard 16 — Focus Management (mandatory)
            </p>
            <p>
              Every interactive ODS component must guarantee a keyboard user always knows where
              focus is and can never lose it. Each of the five guarantees below is required before a
              component may ship.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  k: "Initial focus",
                  d: "On open, focus moves to the first meaningful control (first field, primary action, or the container itself). It never stays behind on the trigger.",
                },
                {
                  k: "Focus trap (overlays)",
                  d: "Dialogs, drawers and the command palette trap Tab / Shift+Tab inside the overlay while open — focus cannot escape to the page behind.",
                },
                {
                  k: "Focus restoration",
                  d: "On close, focus returns to the element that opened the component (the trigger), so the user resumes exactly where they were.",
                },
                {
                  k: "Visible focus indicator",
                  d: "The focused element always shows a visible ring (focus-visible). No invisible focus, ever.",
                },
                {
                  k: "Keyboard escape",
                  d: "Esc closes any overlay; tables/menus define their own documented escape (Esc clears selection). Escape behaviour is always predictable.",
                },
              ].map((g) => (
                <div key={g.k} className="rounded-md border bg-white p-3">
                  <p className="font-semibold text-gray-900 mb-1">{g.k}</p>
                  <p className="text-xs text-gray-600">{g.d}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1 mt-1">Applies to</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Drawers", "Dialogs", "Command Palette", "Dropdowns",
                  "Date Pickers", "Search Bars", "Data Tables",
                ].map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-white border text-gray-700">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-blue-200 bg-white p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">Audited compliance status (CW-01)</p>
              <ul className="space-y-0.5">
                <li>✅ <strong>OdsDialog / OdsDrawer</strong> — verified: Radix-backed, so initial focus, focus trap, restoration and Esc are built in.</li>
                <li>✅ <strong>OdsCommandPalette</strong> — verified: cmdk dialog provides trap + restore; Esc closes.</li>
                <li>✅ <strong>Dropdowns / Selects / Popovers</strong> — verified at the primitive level: Radix provides roving focus, trap and Esc-to-close.</li>
                <li>✅ <strong>OdsSearchBar</strong> — verified: focus-visible ring; Ctrl+F focuses; Esc clears the query and keeps focus.</li>
                <li>✅ <strong>OdsDataTable</strong> — verified: Standard 15 nav, visible active-row ring; Esc clears selection (see above).</li>
                <li>🟡 <strong>Date Picker</strong> — pending: a <code>ui/calendar</code> primitive exists, but there is no dedicated ODS date-picker wrapper yet. To be audited against all five guarantees when one is built.</li>
              </ul>
              <p className="mt-1 text-[11px] text-gray-500">Legend: ✅ verified · 🟡 pending audit. Components are only marked verified once their five guarantees are confirmed against the real implementation.</p>
            </div>
            <p className="text-xs text-gray-500">
              This is the standard for all future components — new interactive ODS components must
              document and satisfy all five guarantees before merge.
            </p>
          </div>
        </Section>

        {/* ── Skeletons ── */}
        <Section id="skeletons" title="OdsTableSkeleton">
          <OdsTableSkeleton rows={4} columns={5} />
        </Section>

        {/* ── Empty States ── */}
        <Section id="empty-states" title="OdsEmptyState">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OdsEmptyState
              icon="📦"
              title="No lots received"
              description="Receive your first cell lot to get started."
              action={{ label: "Receive Lot", onClick: () => notify.info("Action triggered") }}
            />
            <OdsEmptyState
              icon="🔬"
              title="No cells pending grading"
              description="All received cells have been graded."
            />
          </div>
        </Section>

        {/* ── Dialogs ── */}
        <Section id="dialogs" title="OdsDialog">
          <div className="flex gap-2 flex-wrap">
            {(["danger", "warning", "confirm", "default"] as const).map((v) => (
              <Button
                key={v} size="sm" variant="outline"
                onClick={() => { setDialogVariant(v); setDialogOpen(true); }}
              >
                {v} dialog
              </Button>
            ))}
          </div>
          <OdsDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onConfirm={() => { notify.success("Confirmed"); setDialogOpen(false); }}
            title={dialogVariant === "danger" ? "Delete Record" : dialogVariant === "warning" ? "Archive Module" : "Confirm Action"}
            description="This action cannot be undone. Are you sure you want to continue?"
            variant={dialogVariant}
            confirmLabel={dialogVariant === "danger" ? "Delete" : "Confirm"}
          />
        </Section>

        {/* ── Drawers ── */}
        <Section id="drawers" title="OdsDrawer">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>Open Drawer (md)</Button>
          </div>
          <OdsDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="ODS Drawer Example"
            description="Scrollable body, sticky header and footer, Ctrl+S to save."
            onSave={() => { notify.success("Saved from drawer"); setDrawerOpen(false); }}
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Name</label>
                <Input placeholder="Enter a name…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Code</label>
                <Input placeholder="e.g. PRD-001" />
              </div>
              <p className={ods.typography.body.muted}>
                This drawer uses <code className={ods.typography.code}>OdsDrawer</code>.
                It has a sticky header, scrollable body, and a Ctrl+S shortcut.
              </p>
            </div>
          </OdsDrawer>
        </Section>

        {/* ── Notifications ── */}
        <Section id="notifications" title="OdsNotify (Global Notifications)">
          <p className={ods.typography.body.muted}>
            Use <code className={ods.typography.code}>useOdsNotify()</code> — never call{" "}
            <code className={ods.typography.code}>useToast()</code> directly in modules.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => notify.success("Record saved successfully")}>
              ✅ Success
            </Button>
            <Button size="sm" variant="outline" onClick={() => notify.error("Failed to save", { description: "Check your connection" })}>
              ❌ Error
            </Button>
            <Button size="sm" variant="outline" onClick={() => notify.warning("Low stock", { description: "Only 4 cells remaining" })}>
              ⚠️ Warning
            </Button>
            <Button size="sm" variant="outline" onClick={() => notify.info("Order released", { description: "MFG-2026-0001 is now active" })}>
              ℹ️ Info
            </Button>
          </div>
        </Section>

        {/* ═══════════════ ODS Completion Pack Components ═══════════════════ */}

        {/* ── Metric Cards ── */}
        <Section id="metric-cards" title="OdsMetricCard + OdsMetricGrid">
          <p className={ods.typography.body.muted}>
            KPI cards for dashboards. Use inside <code className={ods.typography.code}>OdsMetricGrid</code> for responsive layouts.
          </p>

          <div className="space-y-4">
            <p className={ods.typography.label.section}>Statuses &amp; trends</p>
            <OdsMetricGrid columns={4}>
              <OdsMetricCard
                title="Completed Today"
                value={47}
                unit="packs"
                icon={<Factory className="h-4 w-4 text-green-600" />}
                status="positive"
                trend="up"
                trendValue="+12% vs yesterday"
                footer="batteries shipped"
              />
              <OdsMetricCard
                title="Rework Queue"
                value={8}
                icon={<ShieldCheck className="h-4 w-4 text-red-600" />}
                status="negative"
                trend="up"
                trendValue="+3 since morning"
                footer="open tickets"
              />
              <OdsMetricCard
                title="QC Pending"
                value={5}
                icon={<Activity className="h-4 w-4 text-amber-600" />}
                status="warning"
                trend="flat"
                trendValue="No change"
              />
              <OdsMetricCard
                title="Charger Util."
                value="72%"
                icon={<Zap className="h-4 w-4 text-slate-600" />}
                trend="down"
                trendValue="-8% from peak"
              />
            </OdsMetricGrid>

            <p className={ods.typography.label.section}>Loading skeleton</p>
            <OdsMetricGrid columns={4}>
              {Array.from({ length: 4 }).map((_, i) => (
                <OdsMetricCard key={i} title="" value="" isLoading />
              ))}
            </OdsMetricGrid>

            <p className={ods.typography.label.section}>Grid columns — 2 / 3 / 4 / auto</p>
            <div className="space-y-2">
              {([2, 3, 4, "auto"] as const).map((cols) => (
                <div key={String(cols)}>
                  <p className="text-xs text-slate-400 mb-1">columns={String(cols)}</p>
                  <OdsMetricGrid columns={cols}>
                    {Array.from({ length: Number(cols) === 2 ? 2 : Number(cols) === 3 ? 3 : 4 }).map((_, i) => (
                      <OdsMetricCard
                        key={i}
                        title={`Metric ${i + 1}`}
                        value={Math.floor(Math.random() * 100)}
                      />
                    ))}
                  </OdsMetricGrid>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Chart Card ── */}
        <Section id="chart-card" title="OdsChartCard">
          <p className={ods.typography.body.muted}>
            Wraps any chart (Recharts, custom) with a standard header, toolbar slots, export/refresh actions, loading skeleton, and empty state.
          </p>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => setChartLoading((v) => !v)}>
              Toggle Loading
            </Button>
            <Button size="sm" variant="outline" onClick={() => setChartEmpty((v) => !v)}>
              Toggle Empty
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OdsChartCard
              title="Weekly Production Output"
              subtitle="Batteries completed per day"
              isLoading={chartLoading}
              isEmpty={chartEmpty}
              emptyTitle="No production data"
              emptyDescription="Run production orders to see output here."
              onRefresh={() => notify.info("Refreshed chart")}
              onExport={() => notify.success("Exported to CSV")}
              height={200}
            >
              <SimpleBarChart />
            </OdsChartCard>
            <OdsChartCard
              title="Cell Grade Distribution"
              subtitle="Grade A/B/C breakdown this week"
              isLoading={false}
              isEmpty={chartEmpty}
              height={200}
              legend={
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Grade A (68%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Grade B (24%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Grade C (8%)</span>
                </div>
              }
            >
              <div className="flex items-center justify-center h-full gap-4">
                <div className="flex flex-col gap-2 w-full px-4">
                  {[{ label: "Grade A", pct: 68, color: "bg-green-500" }, { label: "Grade B", pct: 24, color: "bg-blue-500" }, { label: "Grade C", pct: 8, color: "bg-red-400" }].map((g) => (
                    <div key={g.label} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-slate-500 shrink-0">{g.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3">
                        <div className={`h-3 rounded-full ${g.color}`} style={{ width: `${g.pct}%` }} />
                      </div>
                      <span className="w-8 text-right font-medium">{g.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </OdsChartCard>
          </div>
        </Section>

        {/* ── Timeline ── */}
        <Section id="timeline" title="OdsTimeline">
          <p className={ods.typography.body.muted}>
            Event log for battery lifecycle, dispatch history, QC audit trails, and operator activity.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className={cn(ods.typography.label.section, "mb-2")}>Battery lifecycle (5 events)</p>
              <OdsTimeline items={DEMO_TIMELINE_ITEMS} />
            </div>
            <div>
              <p className={cn(ods.typography.label.section, "mb-2")}>Loading state</p>
              <OdsTimeline items={[]} isLoading />
              <p className={cn(ods.typography.label.section, "mt-4 mb-2")}>Empty state</p>
              <OdsTimeline
                items={[]}
                emptyTitle="No events yet"
                emptyDescription="Events will appear here as the order progresses."
              />
            </div>
          </div>
        </Section>

        {/* ── Stepper ── */}
        <Section id="stepper" title="OdsStepper">
          <p className={ods.typography.body.muted}>
            Workflow progress indicator. Supports vertical and horizontal orientations; completed / active / pending / locked / rejected states.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className={cn(ods.typography.label.section, "mb-3")}>Vertical — Manufacturing stages (click to select)</p>
              <OdsStepper
                steps={DEMO_STEPPER_STEPS}
                orientation="vertical"
                selectedId={selectedStep}
                onStepClick={setSelectedStep}
              />
            </div>
            <div>
              <p className={cn(ods.typography.label.section, "mb-3")}>Horizontal — Dispatch workflow</p>
              <OdsStepper
                steps={DISPATCH_STEPS}
                orientation="horizontal"
              />
              <p className={cn(ods.typography.label.section, "mt-4 mb-2")}>All statuses</p>
              <OdsStepper
                orientation="vertical"
                steps={[
                  { id: "c",  label: "Completed",  status: "completed",  description: "Done on 25 Jun 09:30" },
                  { id: "a",  label: "Active",      status: "active",     description: "Currently in progress" },
                  { id: "p",  label: "Pending",     status: "pending",    description: "Waiting to start" },
                  { id: "l",  label: "Locked",      status: "locked",     description: "Not yet unlocked" },
                  { id: "r",  label: "Rejected",    status: "rejected",   description: "Failed QC check" },
                ]}
              />
            </div>
          </div>
        </Section>

        {/* ── Page Layout ── */}
        <Section id="page-layout" title="OdsPageLayout">
          <p className={ods.typography.body.muted}>
            Standard page shell: <code className={ods.typography.code}>ModuleHeader → Toolbar → Content → Footer (optional)</code>.
            All new pages should be built with <code className={ods.typography.code}>OdsPageLayout</code>.
          </p>
          <div className="rounded-xl border border-dashed border-slate-300 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-mono text-slate-500 border-b">Preview (live OdsPageLayout is this entire page)</div>
            <div className="p-4 space-y-2 text-xs text-slate-600">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-700 mb-1">📦 OdsPageLayout props</p>
                <div className="font-mono space-y-0.5 text-slate-500">
                  <p><span className="text-primary">header</span>: ReactNode  — ModuleHeader (required)</p>
                  <p><span className="text-primary">toolbar</span>?: ReactNode — OdsToolbar (optional)</p>
                  <p><span className="text-primary">footer</span>?: ReactNode  — Sticky bottom bar (optional)</p>
                  <p><span className="text-primary">noPadding</span>?: boolean  — Remove default p-6 for full-bleed content</p>
                  <p><span className="text-primary">children</span>: ReactNode  — Main content area</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700">
                ℹ️ The current page (/design-system) uses OdsPageLayout's AppLayout internally. Use{" "}
                <code className="font-mono">OdsPageLayout</code> for all new module pages.
              </div>
            </div>
          </div>
          <div className="bg-slate-950 rounded-lg p-4 text-sm font-mono text-slate-300 leading-relaxed">
            <span className="text-slate-500">{"// Example usage"}</span>
            <br />
            <span className="text-green-400">{"<OdsPageLayout"}</span>
            <br />
            {"  "}<span className="text-blue-300">header</span>{"={"}
            <span className="text-yellow-300">{"<ModuleHeader icon=\"📦\" title=\"Cell Receiving\" />"}</span>
            {"}"}
            <br />
            {"  "}<span className="text-blue-300">toolbar</span>{"={"}
            <span className="text-yellow-300">{"<OdsToolbar ... />"}</span>
            {"}"}
            <br />
            <span className="text-green-400">{">"}</span>
            <br />
            {"  "}<span className="text-slate-400">{"<OdsDataTable ... />"}</span>
            <br />
            <span className="text-green-400">{"</OdsPageLayout>"}</span>
          </div>
        </Section>

        {/* ── Trend icons demo ── */}
        <Section id="trend-icons" title="Metric Trend Icons">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <TrendingUp className="h-4 w-4" /> trend="up"
            </div>
            <div className="flex items-center gap-1.5 text-sm text-red-600">
              <TrendingDown className="h-4 w-4" /> trend="down"
            </div>
            <div className="text-sm text-slate-500">— (Minus) trend="flat"</div>
          </div>
          <p className={ods.typography.body.muted}>
            Pass <code className={ods.typography.code}>trend</code> +{" "}
            <code className={ods.typography.code}>trendValue</code> to OdsMetricCard for animated trend badges.
          </p>
        </Section>

        <div className="pb-12" />
      </div>
    </AppLayout>
  );
}
