import {
  useListCellMasters,
  useCreateCellMaster,
  useUpdateCellMaster,
  useToggleCellMasterStatus,
  getListCellMastersQueryKey,
} from "@workspace/api-client-react";
import { CellMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<CellMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "manufacturer", header: "Manufacturer" },
  { accessorKey: "model", header: "Model" },
  { accessorKey: "capacity_mah", header: "Capacity (mAh)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "model", label: "Model", type: "text" },
  { name: "chemistry", label: "Chemistry", type: "text" },
  { name: "capacity_mah", label: "Capacity (mAh)", type: "number" },
  { name: "nominal_voltage_v", label: "Nominal Voltage (V)", type: "number" },
  { name: "max_voltage_v", label: "Max Voltage (V)", type: "number" },
  { name: "min_voltage_v", label: "Min Voltage (V)", type: "number" },
  { name: "weight_g", label: "Weight (g)", type: "number" },
  { name: "dimensions", label: "Dimensions", type: "text" },
  { name: "internal_resistance_spec_mohm", label: "Internal Resistance (mOhm)", type: "number" },
  { name: "cycle_life", label: "Cycle Life", type: "number" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text" },
  { name: "approved_supplier", label: "Approved Supplier", type: "text" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const config: MasterConfig<CellMaster> = {
  resource: "cells",
  title: "Cell Master",
  description: "Manage cell definitions and specifications",
  columns,
  fields: fields as any,
};

export default function CellMasterPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListCellMasters,
        useCreate: useCreateCellMaster,
        useUpdate: useUpdateCellMaster,
        useToggleStatus: useToggleCellMasterStatus,
        listQueryKey: getListCellMastersQueryKey(),
      }}
    />
  );
}
