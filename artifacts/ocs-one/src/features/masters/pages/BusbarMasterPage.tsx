import {
  useListBusbarMasters,
  useCreateBusbarMaster,
  useUpdateBusbarMaster,
  useToggleBusbarMasterStatus,
  getListBusbarMastersQueryKey,
} from "@workspace/api-client-react";
import { BusbarMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<BusbarMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "material", header: "Material" },
  { accessorKey: "thickness_mm", header: "Thickness (mm)" },
  { accessorKey: "width_mm", header: "Width (mm)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. BUS-CU-200" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Copper Busbar 200mm" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  {
    name: "material",
    label: "Material",
    type: "select",
    required: true,
    options: [
      { label: "Copper", value: "copper" },
      { label: "Aluminium", value: "aluminium" },
    ],
  },
  { name: "thickness_mm", label: "Thickness (mm)", type: "number", required: true, placeholder: "e.g. 3" },
  { name: "width_mm", label: "Width (mm)", type: "number", required: true, placeholder: "e.g. 20" },
  { name: "length_mm", label: "Length (mm)", type: "number", required: true, placeholder: "e.g. 200" },
  { name: "surface_finish", label: "Surface Finish", type: "text", required: true, placeholder: "e.g. Tin plated" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<BusbarMaster> = {
  resource: "busbars",
  title: "Busbar Master",
  description: "Manage busbar definitions and specifications",
  icon: "🔩",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function BusbarMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListBusbarMasters,
        useCreate: useCreateBusbarMaster,
        useUpdate: useUpdateBusbarMaster,
        useToggleStatus: useToggleBusbarMasterStatus,
        listQueryKey: getListBusbarMastersQueryKey(),
      }}
    />
  );
}
