import { useState, useRef } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MasterConfig } from "../types/master.types";
import { MasterDataGrid } from "./MasterDataGrid";
import { MasterEditDrawer } from "./MasterEditDrawer";
import { useMasterCrud } from "../hooks/useMasterCrud";
import AppLayout from "@/layouts/AppLayout";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsTableSkeleton, OdsEmptyState } from "@/components/ods";

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
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    listQuery,
    handleCreate,
    handleUpdate,
    handleToggleStatus,
  } = useMasterCrud<T>(config.resource, hooks);

  const handleAdd = () => {
    setEditingItem(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (item: T) => {
    setEditingItem(item);
    setIsDrawerOpen(true);
  };

  useModuleShortcuts({
    onNew: handleAdd,
    onEdit: () => { if (selectedItem) handleEdit(selectedItem); },
    searchRef,
  });

  const handleSave = async (data: any) => {
    if (editingItem) {
      await handleUpdate(editingItem.id, data);
    } else {
      await handleCreate(data);
    }
  };

  const items = listQuery.data?.items ?? [];
  const filtered = searchTerm
    ? items.filter((item: any) =>
        Object.values(item).some((v) =>
          String(v ?? "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : items;

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          icon={config.icon ?? "📋"}
          title={config.title}
          description={config.description}
          certification={config.certification ?? "certified"}
          actions={
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" /> Add {config.title}
            </Button>
          }
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => listQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {listQuery.isLoading ? (
          <OdsTableSkeleton rows={6} columns={config.columns.length + 2} />
        ) : filtered.length === 0 ? (
          <OdsEmptyState
            icon={config.icon ?? "📋"}
            title={`No ${config.title.toLowerCase()} found`}
            description={searchTerm ? "Try a different search term." : `Add your first ${config.title.toLowerCase()} to get started.`}
            action={!searchTerm ? { label: `Add ${config.title}`, onClick: handleAdd } : undefined}
          />
        ) : (
          <MasterDataGrid
            data={filtered}
            columns={config.columns}
            onEdit={handleEdit}
            onToggleStatus={(id, status) => handleToggleStatus(id, status)}
            selectedId={selectedItem?.id}
            onRowClick={(item) => setSelectedItem(item)}
          />
        )}

        <MasterEditDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSave={handleSave}
          initialData={editingItem}
          fields={config.fields}
          title={config.title}
        />
      </div>
    </AppLayout>
  );
}
