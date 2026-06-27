import {
  useListCableMasters,
  useCreateCableMaster,
  useUpdateCableMaster,
  useToggleCableMasterStatus,
  getListCableMastersQueryKey,
} from "@workspace/api-client-react";
import { CableMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<CableMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "size_sqmm", header: "Size (mm²)" },
  { accessorKey: "current_rating_a", header: "Current (A)" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CBL-16SQ-BLK" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. 16mm² Power Cable Black" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. Finolex" },
  { name: "size_sqmm", label: "Size (mm²)", type: "number", required: true, placeholder: "e.g. 16" },
  { name: "colour", label: "Colour", type: "text", required: true, placeholder: "e.g. Black" },
  { name: "current_rating_a", label: "Current Rating (A)", type: "number", required: true, placeholder: "e.g. 75" },
  { name: "insulation_type", label: "Insulation Type", type: "text", required: true, placeholder: "e.g. PVC" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<CableMaster> = {
  resource: "cables",
  title: "Cable Master",
  description: "Manage cable definitions and specifications",
  columns,
  fields: fields as any,
};

export default function CableMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListCableMasters,
        useCreate: useCreateCableMaster,
        useUpdate: useUpdateCableMaster,
        useToggleStatus: useToggleCableMasterStatus,
        listQueryKey: getListCableMastersQueryKey(),
      }}
    />
  );
}
