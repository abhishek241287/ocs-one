import {
  useListTestEquipmentMasters,
  useCreateTestEquipmentMaster,
  useUpdateTestEquipmentMaster,
  useToggleTestEquipmentMasterStatus,
  getListTestEquipmentMastersQueryKey,
} from "@workspace/api-client-react";
import { TestEquipmentMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<TestEquipmentMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "equipment_name", header: "Equipment Name" },
  { accessorKey: "model", header: "Model" },
  { accessorKey: "next_calibration_due", header: "Next Calibration" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. TE-CAP-001" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Neware Battery Tester" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "equipment_name", label: "Equipment Name", type: "text", required: true, placeholder: "e.g. Neware CT-4008" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. Neware" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. CT-4008" },
  {
    name: "equipment_type",
    label: "Equipment Type",
    type: "select",
    options: [
      { label: "Capacity Tester", value: "capacity_tester" },
      { label: "DC Load", value: "dc_load" },
      { label: "Protection Tester", value: "protection_tester" },
      { label: "Internal Resistance Meter", value: "internal_resistance_meter" },
      { label: "Thermal Camera", value: "thermal_camera" },
      { label: "Other", value: "other" },
    ],
  },
  { name: "serial_number", label: "Serial Number", type: "text", required: true, placeholder: "e.g. NW2024001" },
  { name: "calibration_date", label: "Calibration Date", type: "date", required: true },
  { name: "next_calibration_due", label: "Next Calibration Due", type: "date", required: true },
  {
    name: "floor_status",
    label: "Floor Status",
    type: "select",
    options: [
      { label: "Available", value: "available" },
      { label: "Busy", value: "busy" },
      { label: "Maintenance", value: "maintenance" },
    ],
  },
  { name: "software_version", label: "Software Version", type: "text", placeholder: "e.g. v3.2.1" },
  { name: "location", label: "Location", type: "text", placeholder: "e.g. Lab-1, Rack B" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<TestEquipmentMaster> = {
  resource: "test-equipment",
  title: "Test Equipment",
  description: "Manage test equipment definitions and specifications",
  columns,
  fields: fields as any,
};

export default function TestEquipmentMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListTestEquipmentMasters,
        useCreate: useCreateTestEquipmentMaster,
        useUpdate: useUpdateTestEquipmentMaster,
        useToggleStatus: useToggleTestEquipmentMasterStatus,
        listQueryKey: getListTestEquipmentMastersQueryKey(),
      }}
    />
  );
}
