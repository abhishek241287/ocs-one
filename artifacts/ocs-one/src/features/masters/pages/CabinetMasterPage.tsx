import {
  useListCabinetMasters,
  useCreateCabinetMaster,
  useUpdateCabinetMaster,
  useToggleCabinetMasterStatus,
  getListCabinetMastersQueryKey,
} from "@workspace/api-client-react";
import { CabinetMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<CabinetMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "model", header: "Model" },
  { accessorKey: "ip_rating", header: "IP Rating" },
  { accessorKey: "mounting_type", header: "Mounting" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "model", label: "Model", type: "text" },
  { name: "material", label: "Material", type: "text" },
  { name: "ip_rating", label: "IP Rating", type: "text" },
  { name: "dimensions", label: "Dimensions", type: "text" },
  { name: "weight_kg", label: "Weight (kg)", type: "number" },
  { name: "colour", label: "Colour", type: "text" },
  {
    name: "mounting_type",
    label: "Mounting Type",
    type: "select",
    options: [
      { label: "Wall", value: "Wall" },
      { label: "Floor", value: "Floor" },
      { label: "Rack", value: "Rack" },
    ],
  },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const config: MasterConfig<CabinetMaster> = {
  resource: "cabinets",
  title: "Cabinet Master",
  description: "Manage cabinet definitions and specifications",
  columns,
  fields: fields as any,
};

export default function CabinetMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListCabinetMasters,
        useCreate: useCreateCabinetMaster,
        useUpdate: useUpdateCabinetMaster,
        useToggleStatus: useToggleCabinetMasterStatus,
        listQueryKey: getListCabinetMastersQueryKey(),
      }}
    />
  );
}
