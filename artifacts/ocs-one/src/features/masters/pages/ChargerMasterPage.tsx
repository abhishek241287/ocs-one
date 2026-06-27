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
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CHG-48V50" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. 48V 50A CC/CV Charger" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. Victron" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. Blue Smart 48/50" },
  { name: "output_voltage_v", label: "Output Voltage (V)", type: "number", required: true, placeholder: "e.g. 58.4" },
  { name: "output_current_a", label: "Output Current (A)", type: "number", required: true, placeholder: "e.g. 50" },
  { name: "power_kw", label: "Power (kW)", type: "number", required: true, placeholder: "e.g. 2.92" },
  { name: "communication_protocol", label: "Communication Protocol", type: "text", required: true, placeholder: "e.g. Bluetooth, CAN" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text", placeholder: "https://..." },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
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
