import {
  useListBmsMasters,
  useCreateBmsMaster,
  useUpdateBmsMaster,
  useToggleBmsMasterStatus,
  getListBmsMastersQueryKey,
} from "@workspace/api-client-react";
import { BmsMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<BmsMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
  { accessorKey: "model", header: "Model" },
  { accessorKey: "current_rating_a", header: "Current (A)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. BMS-48V200" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. 48V 200A Smart BMS" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. Daly" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. 48V200A-16S" },
  { name: "current_rating_a", label: "Current Rating (A)", type: "number", required: true, placeholder: "e.g. 200" },
  { name: "min_voltage_v", label: "Min Voltage (V)", type: "number", required: true, placeholder: "e.g. 40" },
  { name: "max_voltage_v", label: "Max Voltage (V)", type: "number", required: true, placeholder: "e.g. 60" },
  { name: "cell_support_count", label: "Cell Support Count", type: "number", required: true, placeholder: "e.g. 16" },
  { name: "has_bluetooth", label: "Bluetooth", type: "boolean" },
  { name: "has_can", label: "CAN Bus", type: "boolean" },
  { name: "has_rs485", label: "RS-485", type: "boolean" },
  { name: "has_uart", label: "UART", type: "boolean" },
  { name: "firmware_version", label: "Firmware Version", type: "text", placeholder: "e.g. v2.1.3" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text", placeholder: "https://..." },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<BmsMaster> = {
  resource: "bms",
  title: "BMS Master",
  description: "Manage BMS definitions and specifications",
  columns,
  fields: fields as any,
};

export default function BmsMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListBmsMasters,
        useCreate: useCreateBmsMaster,
        useUpdate: useUpdateBmsMaster,
        useToggleStatus: useToggleBmsMasterStatus,
        listQueryKey: getListBmsMastersQueryKey(),
      }}
    />
  );
}
