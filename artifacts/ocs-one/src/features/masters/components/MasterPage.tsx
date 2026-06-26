import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MasterConfig } from "../types/master.types";
import { MasterDataGrid } from "./MasterDataGrid";
import { MasterEditDrawer } from "./MasterEditDrawer";
import { useMasterCrud } from "../hooks/useMasterCrud";
import AppLayout from "@/layouts/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";

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

  const handleSave = async (data: any) => {
    if (editingItem) {
      await handleUpdate(editingItem.id, data);
    } else {
      await handleCreate(data);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{config.title}</h1>
            <p className="text-muted-foreground">{config.description}</p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add {config.title}
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <MasterDataGrid
            data={listQuery.data?.items || []}
            columns={config.columns}
            onEdit={handleEdit}
            onToggleStatus={(id, status) => handleToggleStatus(id, status)}
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
