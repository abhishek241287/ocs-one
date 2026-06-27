import {
  useListConnectorMasters,
  useCreateConnectorMaster,
  useUpdateConnectorMaster,
  useToggleConnectorMasterStatus,
  getListConnectorMastersQueryKey,
} from "@workspace/api-client-react";
import { ConnectorMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<ConnectorMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
  { accessorKey: "connector_type", header: "Type" },
  { accessorKey: "current_rating_a", header: "Current (A)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CONN-XT90" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. XT90 Male Connector" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. Amphenol" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. XT90-M" },
  { name: "connector_type", label: "Connector Type", type: "text", required: true, placeholder: "e.g. XT90" },
  { name: "current_rating_a", label: "Current Rating (A)", type: "number", required: true, placeholder: "e.g. 90" },
  { name: "voltage_rating_v", label: "Voltage Rating (V)", type: "number", required: true, placeholder: "e.g. 60" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text", placeholder: "https://..." },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<ConnectorMaster> = {
  resource: "connectors",
  title: "Connector Master",
  description: "Manage connector definitions and specifications",
  columns,
  fields: fields as any,
};

export default function ConnectorMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListConnectorMasters,
        useCreate: useCreateConnectorMaster,
        useUpdate: useUpdateConnectorMaster,
        useToggleStatus: useToggleConnectorMasterStatus,
        listQueryKey: getListConnectorMastersQueryKey(),
      }}
    />
  );
}
