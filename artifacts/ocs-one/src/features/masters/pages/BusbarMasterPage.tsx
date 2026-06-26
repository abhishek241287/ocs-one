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
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  {
    name: "material",
    label: "Material",
    type: "select",
    options: [
      { label: "Copper", value: "Copper" },
      { label: "Aluminium", value: "Aluminium" },
    ],
  },
  { name: "thickness_mm", label: "Thickness (mm)", type: "number" },
  { name: "width_mm", label: "Width (mm)", type: "number" },
  { name: "length_mm", label: "Length (mm)", type: "number" },
  { name: "surface_finish", label: "Surface Finish", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const config: MasterConfig<BusbarMaster> = {
  resource: "busbars",
  title: "Busbar Master",
  description: "Manage busbar definitions and specifications",
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
