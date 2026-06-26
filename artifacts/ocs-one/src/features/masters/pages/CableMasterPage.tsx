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
  { accessorKey: "size_sqmm", header: "Size (sqmm)" },
  { accessorKey: "current_rating_a", header: "Current (A)" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "size_sqmm", label: "Size (sqmm)", type: "number" },
  { name: "colour", label: "Colour", type: "text" },
  { name: "current_rating_a", label: "Current Rating (A)", type: "number" },
  { name: "insulation_type", label: "Insulation Type", type: "text" },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
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
