import { useState, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListDealers, useCreateDealer, useUpdateDealer, useDeleteDealer,
  getListDealersQueryKey, Dealer, DealerInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import {
  ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge, OdsDrawer, OdsDialog,
} from "@/components/ods";

const EMPTY_FORM: Omit<DealerInput, "creditLimit"> & { creditLimit: string } = {
  dealerCode: "", dealerName: "", gstNumber: "", address: "", contactPerson: "",
  mobile: "", email: "", territory: "", creditLimit: "0", status: "active",
};

const COLUMNS: ColumnDef<Dealer>[] = [
  {
    accessorKey: "dealerCode",
    header: "Code",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold">{row.original.dealerCode}</span>
    ),
  },
  { accessorKey: "dealerName", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.dealerName}</span> },
  { accessorKey: "gstNumber",  header: "GST",      cell: ({ row }) => <span className="text-xs">{row.original.gstNumber ?? "—"}</span> },
  { accessorKey: "territory",  header: "Territory", cell: ({ row }) => <span className="text-xs">{row.original.territory ?? "—"}</span> },
  { accessorKey: "contactPerson", header: "Contact",  cell: ({ row }) => <span className="text-xs">{row.original.contactPerson ?? "—"}</span> },
  { accessorKey: "mobile",     header: "Mobile",    cell: ({ row }) => <span className="text-xs">{row.original.mobile ?? "—"}</span> },
  {
    accessorKey: "creditLimit",
    header: "Credit Limit",
    cell: ({ row }) => (
      <span className="text-xs">₹{Number(row.original.creditLimit ?? 0).toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OdsStatusBadge status={row.original.status} />,
  },
];

export default function DealerMasterPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<Dealer | null>(null);
  selectedRef.current = selectedDealer;

  const { data, isLoading, isFetching, refetch } = useListDealers(search ? { search } : {});
  const createDealer = useCreateDealer();
  const updateDealer = useUpdateDealer();
  const deleteDealer = useDeleteDealer();

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDrawerOpen(true); };
  const openEdit = (d: Dealer) => {
    setEditing(d);
    setForm({
      dealerCode: d.dealerCode, dealerName: d.dealerName,
      gstNumber: d.gstNumber ?? "", address: d.address ?? "",
      contactPerson: d.contactPerson ?? "", mobile: d.mobile ?? "",
      email: d.email ?? "", territory: d.territory ?? "",
      creditLimit: String(d.creditLimit ?? "0"),
      status: d.status,
    });
    setDrawerOpen(true);
  };

  useModuleShortcuts({
    onNew: openCreate,
    onEdit: () => { const d = selectedRef.current; if (d) openEdit(d); },
    searchRef,
  });

  const handleSave = async () => {
    if (!form.dealerCode.trim() || !form.dealerName.trim()) {
      notify.warning("Dealer code and name are required");
      return;
    }
    const payload: DealerInput = {
      ...form,
      creditLimit: parseFloat(form.creditLimit) || 0,
      gstNumber: form.gstNumber || undefined,
      address: form.address || undefined,
      contactPerson: form.contactPerson || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      territory: form.territory || undefined,
    };
    if (editing) {
      await updateDealer.mutateAsync({ id: editing.id, data: payload });
      notify.success("Dealer updated");
    } else {
      await createDealer.mutateAsync({ data: payload });
      notify.success("Dealer created");
    }
    qc.invalidateQueries({ queryKey: getListDealersQueryKey() });
    setDrawerOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDealer.mutateAsync({ id: deleteId });
      notify.success("Dealer deleted");
      qc.invalidateQueries({ queryKey: getListDealersQueryKey() });
    } catch {
      notify.error("Failed to delete dealer");
    } finally {
      setDeleteId(null);
    }
  };

  const isSaving = createDealer.isPending || updateDealer.isPending;
  const items = data?.items ?? [];

  const f = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const rowActions = (d: Dealer) => (
    <>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)} title="Edit">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)} title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🏢"
          title="Dealer Master"
          description="Manage dealer accounts and territories"
          certification="certified"
          actions={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> New Dealer
            </Button>
          }
        />

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="🏢"
          emptyTitle="No dealers found"
          emptyDescription={search ? "Try a different search term." : "Add your first dealer to get started."}
          emptyAction={!search ? { label: "New Dealer", onClick: openCreate } : undefined}
          rowActions={rowActions}
          onRowClick={(d) => setSelectedDealer(d)}
          getRowId={(d) => d.id}
          selectedId={selectedDealer?.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={
            <OdsToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: "Search by name, code, territory…",
                ref: searchRef,
              }}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />

        <OdsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={editing ? "Edit Dealer" : "New Dealer"}
          description="Fill in the dealer details below. Required fields are marked *."
          onSave={handleSave}
          isSaving={isSaving}
          isSaveDisabled={!form.dealerCode.trim() || !form.dealerName.trim()}
          size="lg"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Dealer Code *</Label>
              <Input value={form.dealerCode} onChange={f("dealerCode")} placeholder="DLR-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dealer Name *</Label>
              <Input value={form.dealerName} onChange={f("dealerName")} placeholder="Dealer full name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">GST Number</Label>
              <Input value={form.gstNumber} onChange={f("gstNumber")} placeholder="27AADCB…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Territory</Label>
              <Input value={form.territory} onChange={f("territory")} placeholder="Maharashtra, North…" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={f("address")} placeholder="Full address" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Person</Label>
              <Input value={form.contactPerson} onChange={f("contactPerson")} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mobile</Label>
              <Input value={form.mobile} onChange={f("mobile")} placeholder="+91…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={f("email")} placeholder="dealer@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Credit Limit (₹)</Label>
              <Input type="number" value={form.creditLimit} onChange={f("creditLimit")} placeholder="500000" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status ?? "active"}
                onValueChange={(v) => setForm((p) => ({ ...p, status: v as "active" | "inactive" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </OdsDrawer>

        <OdsDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
          title="Delete Dealer"
          description="This will permanently delete the dealer and cannot be undone."
          variant="danger"
          confirmLabel="Delete"
        />
      </div>
    </AppLayout>
  );
}
