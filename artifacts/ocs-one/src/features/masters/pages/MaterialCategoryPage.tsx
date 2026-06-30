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
import { FAMILY_LABELS, FAMILY_OPTIONS } from "../constants/linkedMaster";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<MaterialCategory>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  {
    id: "family",
    header: "Component Family",
    accessorFn: (row: any) =>
      row.linked_master_type ? (FAMILY_LABELS[row.linked_master_type] ?? row.linked_master_type) : "—",
  },
  { accessorKey: "description", header: "Description" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. PCB" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Printed Circuit Board" },
  {
    name: "linked_master_type",
    label: "Component Family",
    type: "select",
    placeholder: "None — consumable / packaging / service category",
    options: FAMILY_OPTIONS,
    helpText:
      "Set this only for inventory-component categories. Materials in this category link to a master of this family.",
  },
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
  transformSubmit: (data) => ({
    ...data,
    linked_master_type: (data.linked_master_type as string) || null,
  }),
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
