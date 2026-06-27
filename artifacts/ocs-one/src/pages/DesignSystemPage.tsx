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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnDef } from "@tanstack/react-table";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ods } from "@/ods/theme";
import { cn } from "@/lib/utils";

// ── Sample data ────────────────────────────────────────────────────────────

interface SampleRow {
  id: string;
  name: string;
  status: string;
  type: string;
  amount: number;
}

const SAMPLE_DATA: SampleRow[] = [
  { id: "1", name: "OCS 48V 280Ah Pack", status: "active", type: "Energy Storage", amount: 85000 },
  { id: "2", name: "OCS 24V 150Ah Pack", status: "inactive", type: "Battery", amount: 42000 },
  { id: "3", name: "BMS-16S-A100", status: "active", type: "BMS", amount: 8500 },
  { id: "4", name: "Charger CHG-50A", status: "active", type: "Charger", amount: 12000 },
  { id: "5", name: "Test Equip TE-01", status: "inactive", type: "Equipment", amount: 35000 },
];

const SAMPLE_COLS: ColumnDef<SampleRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "type", header: "Type" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <OdsStatusBadge status={row.original.status} /> },
  { accessorKey: "amount", header: "Amount", cell: ({ row }) => `₹${row.original.amount.toLocaleString()}` },
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

// ── Page ──────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const notify = useOdsNotify();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogVariant, setDialogVariant] = useState<"default" | "danger" | "warning" | "confirm">("danger");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const sections = [
    "Tokens", "Typography", "Badges", "Status", "Toolbar", "Search",
    "Tables", "Skeletons", "Empty States", "Dialogs", "Drawers", "Notifications",
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
              href={`#${s.toLowerCase().replace(" ", "-")}`}
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
              <TokenSwatch label="ods.colors.status.success.dot (dot)" classes={`${ods.colors.status.success.dot} h-4 w-4 rounded-full`} />
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
            <Button size="sm" variant="outline" onClick={() => setShowSkeleton((v) => !v)}>
              Toggle Loading
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowEmpty((v) => !v)}>
              Toggle Empty
            </Button>
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
                key={v}
                size="sm"
                variant="outline"
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
            <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>
              Open Drawer (md)
            </Button>
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

        <div className="pb-12" />
      </div>
    </AppLayout>
  );
}
