import { useState, useRef, useCallback } from "react";
import { Plus, Edit, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { MasterConfig } from "../types/master.types";
import { MasterEditDrawer } from "./MasterEditDrawer";
import { useMasterCrud } from "../hooks/useMasterCrud";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/layouts/AppLayout";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge, OdsDialog } from "@/components/ods";

interface MasterPageProps<T> {
  config: MasterConfig<T>;
  hooks: any;
}

export function MasterPage<T extends { id: string; status: "active" | "inactive" }>({
  config,
  hooks,
}: MasterPageProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [toggleTarget, setToggleTarget] = useState<T | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<T | null>(null);
  selectedRef.current = selectedItem;

  const { listQuery, handleCreate, handleUpdate, handleToggleStatus } =
    useMasterCrud<T>(config.resource, hooks);

  // Master writes are governed to owner + director (mirrors the backend
  // requireWriteRole(owner,director) gate). Everyone else sees a read-only view.
  const { user } = useAuth();
  const canWrite = user?.role === "owner" || user?.role === "director";

  const handleAdd = useCallback(() => { setEditingItem(null); setIsDrawerOpen(true); }, []);
  const handleEdit = useCallback((item: T) => { setEditingItem(item); setIsDrawerOpen(true); }, []);

  useModuleShortcuts({
    onNew: handleAdd,
    onEdit: () => { const s = selectedRef.current; if (s) handleEdit(s); },
    searchRef,
  });

  const handleSave = async (data: any) => {
    const payload = config.transformSubmit ? config.transformSubmit(data) : data;
    if (editingItem) {
      await handleUpdate(editingItem.id, payload);
    } else {
      await handleCreate(payload);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextStatus = toggleTarget.status === "active" ? "inactive" : "active";
    await handleToggleStatus(toggleTarget.id, nextStatus);
    setToggleTarget(null);
  };

  const items = listQuery.data?.items ?? [];
  const filtered = searchTerm
    ? items.filter((item: any) =>
        Object.values(item).some((v) =>
          String(v ?? "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : items;

  // Append status column to the config columns
  const columns: ColumnDef<T>[] = [
    ...config.columns,
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <OdsStatusBadge status={row.original.status} />,
    },
  ];

  const rowActions = canWrite
    ? (item: T) => (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleEdit(item)}
            title="Edit"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setToggleTarget(item)}
            title={item.status === "active" ? "Deactivate" : "Activate"}
          >
            {item.status === "active" ? (
              <PowerOff className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Power className="h-3.5 w-3.5 text-primary" />
            )}
          </Button>
        </>
      )
    : undefined;

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          icon={config.icon ?? "📋"}
          title={config.title}
          description={config.description}
          certification={config.certification ?? "certified"}
          actions={
            canWrite ? (
              <Button onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" /> Add {config.title}
              </Button>
            ) : undefined
          }
        />

        <OdsDataTable
          data={filtered}
          columns={columns}
          isLoading={listQuery.isLoading}
          emptyIcon={config.icon ?? "📋"}
          emptyTitle={`No ${config.title.toLowerCase()} found`}
          emptyDescription={
            searchTerm
              ? "Try a different search term."
              : `Add your first ${config.title.toLowerCase()} to get started.`
          }
          emptyAction={canWrite && !searchTerm ? { label: `Add ${config.title}`, onClick: handleAdd } : undefined}
          rowActions={rowActions}
          onRowClick={(item) => setSelectedItem(item)}
          getRowId={(item) => item.id}
          selectedId={selectedItem?.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={
            <OdsToolbar
              search={{
                value: searchTerm,
                onChange: setSearchTerm,
                placeholder: `Search ${config.title.toLowerCase()}…`,
                captureCtrlF: true,
              }}
              onRefresh={() => listQuery.refetch()}
              isRefreshing={listQuery.isFetching}
            />
          }
        />

        <MasterEditDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSave={handleSave}
          initialData={editingItem}
          fields={config.fields}
          title={config.title}
          reconcile={config.onFieldChange}
        />

        <OdsDialog
          open={!!toggleTarget}
          onClose={() => setToggleTarget(null)}
          onConfirm={handleConfirmToggle}
          title={toggleTarget?.status === "active" ? "Deactivate Record" : "Activate Record"}
          description={
            toggleTarget?.status === "active"
              ? "This will mark the record as inactive. You can reactivate it later."
              : "This will mark the record as active again."
          }
          variant={toggleTarget?.status === "active" ? "warning" : "confirm"}
          confirmLabel={toggleTarget?.status === "active" ? "Deactivate" : "Activate"}
        />
      </div>
    </AppLayout>
  );
}
