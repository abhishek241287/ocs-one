import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useToggleSupplierStatus,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { Supplier } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Supplier>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  {
    id: "description",
    header: "Description",
    accessorFn: (row: any) => row.description || "—",
  },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. SUP-001" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. EVE Energy Co." },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<Supplier> = {
  resource: "suppliers",
  title: "Supplier Master",
  description: "Approved suppliers — every GRN references a supplier from this list",
  icon: "🏭",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function SupplierMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListSuppliers,
        useCreate: useCreateSupplier,
        useUpdate: useUpdateSupplier,
        useToggleStatus: useToggleSupplierStatus,
        listQueryKey: getListSuppliersQueryKey(),
      }}
    />
  );
}
