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
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "equipment_name", label: "Equipment Name", type: "text" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "model", label: "Model", type: "text" },
  { name: "serial_number", label: "Serial Number", type: "text" },
  { name: "calibration_date", label: "Calibration Date", type: "date" },
  { name: "next_calibration_due", label: "Next Calibration Due", type: "date" },
  { name: "software_version", label: "Software Version", type: "text" },
  { name: "location", label: "Location", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
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
