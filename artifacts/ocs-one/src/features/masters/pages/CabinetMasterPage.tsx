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
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CAB-IP65-300" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. IP65 Wall Mount Cabinet" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. C48-16" },
  { name: "material", label: "Material", type: "text", required: true, placeholder: "e.g. Aluminium" },
  { name: "ip_rating", label: "IP Rating", type: "text", required: true, placeholder: "e.g. IP65" },
  { name: "dimensions", label: "Dimensions", type: "text", required: true, placeholder: "e.g. 300×200×150 mm" },
  { name: "weight_kg", label: "Weight (kg)", type: "number", required: true, placeholder: "e.g. 5.5" },
  { name: "colour", label: "Colour", type: "text", required: true, placeholder: "e.g. RAL7035" },
  {
    name: "mounting_type",
    label: "Mounting Type",
    type: "select",
    required: true,
    options: [
      { label: "Wall", value: "wall" },
      { label: "Floor", value: "floor" },
      { label: "Rack", value: "rack" },
    ],
  },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
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
