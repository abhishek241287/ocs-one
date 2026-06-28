import {
  useListProductCategories,
  useCreateProductCategory,
  useUpdateProductCategory,
  useToggleProductCategoryStatus,
  getListProductCategoriesQueryKey,
} from "@workspace/api-client-react";
import { ProductCategory } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<ProductCategory>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "description", header: "Description" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. BATTERY_PACK" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Battery Pack" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<ProductCategory> = {
  resource: "product-categories",
  title: "Product Category",
  description: "Top-level product families (Battery Pack, Inbuilt Lithium Inverter, Hybrid Inverter)",
  icon: "🗂️",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function ProductCategoryPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListProductCategories,
        useCreate: useCreateProductCategory,
        useUpdate: useUpdateProductCategory,
        useToggleStatus: useToggleProductCategoryStatus,
        listQueryKey: getListProductCategoriesQueryKey(),
      }}
    />
  );
}
