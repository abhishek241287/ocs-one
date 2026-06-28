import {
  useListMaterialCategories,
  useCreateMaterialCategory,
  useUpdateMaterialCategory,
  useToggleMaterialCategoryStatus,
  getListMaterialCategoriesQueryKey,
} from "@workspace/api-client-react";
import { MaterialCategory } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<MaterialCategory>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "description", header: "Description" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. PCB" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Printed Circuit Board" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<MaterialCategory> = {
  resource: "material-categories",
  title: "Material Category",
  description: "Extensible lookup classifying inventory materials (cells, PCB, BMS, packing, …)",
  icon: "🏷️",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function MaterialCategoryPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListMaterialCategories,
        useCreate: useCreateMaterialCategory,
        useUpdate: useUpdateMaterialCategory,
        useToggleStatus: useToggleMaterialCategoryStatus,
        listQueryKey: getListMaterialCategoriesQueryKey(),
      }}
    />
  );
}
