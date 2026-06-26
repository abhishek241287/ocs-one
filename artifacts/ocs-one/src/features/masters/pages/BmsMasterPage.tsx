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
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "model", label: "Model", type: "text" },
  { name: "current_rating_a", label: "Current Rating (A)", type: "number" },
  { name: "min_voltage_v", label: "Min Voltage (V)", type: "number" },
  { name: "max_voltage_v", label: "Max Voltage (V)", type: "number" },
  { name: "cell_support_count", label: "Cell Support Count", type: "number" },
  { name: "has_bluetooth", label: "Bluetooth", type: "boolean" },
  { name: "has_can", label: "CAN", type: "boolean" },
  { name: "has_rs485", label: "RS485", type: "boolean" },
  { name: "has_uart", label: "UART", type: "boolean" },
  { name: "firmware_version", label: "Firmware Version", type: "text" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
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
