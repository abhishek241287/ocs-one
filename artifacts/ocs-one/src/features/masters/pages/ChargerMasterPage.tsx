import {
  useListChargerMasters,
  useCreateChargerMaster,
  useUpdateChargerMaster,
  useToggleChargerMasterStatus,
  getListChargerMastersQueryKey,
} from "@workspace/api-client-react";
import { ChargerMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<ChargerMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
  { accessorKey: "output_voltage_v", header: "Voltage (V)" },
  { accessorKey: "output_current_a", header: "Current (A)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "model", label: "Model", type: "text" },
  { name: "output_voltage_v", label: "Output Voltage (V)", type: "number" },
  { name: "output_current_a", label: "Output Current (A)", type: "number" },
  { name: "power_kw", label: "Power (kW)", type: "number" },
  { name: "communication_protocol", label: "Communication Protocol", type: "text" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const config: MasterConfig<ChargerMaster> = {
  resource: "chargers",
  title: "Charger Master",
  description: "Manage charger definitions and specifications",
  columns,
  fields: fields as any,
};

export default function ChargerMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListChargerMasters,
        useCreate: useCreateChargerMaster,
        useUpdate: useUpdateChargerMaster,
        useToggleStatus: useToggleChargerMasterStatus,
        listQueryKey: getListChargerMastersQueryKey(),
      }}
    />
  );
}
