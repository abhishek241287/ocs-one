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
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CELL-LFP-280" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. LiFePO4 280Ah Prismatic Cell" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional notes about this cell" },
  { name: "manufacturer", label: "Manufacturer", type: "text", required: true, placeholder: "e.g. CATL" },
  { name: "model", label: "Model", type: "text", required: true, placeholder: "e.g. LF280K" },
  { name: "chemistry", label: "Chemistry", type: "text", required: true, placeholder: "e.g. LiFePO4" },
  { name: "capacity_mah", label: "Capacity (mAh)", type: "number", required: true, placeholder: "e.g. 280000" },
  { name: "nominal_voltage_v", label: "Nominal Voltage (V)", type: "number", required: true, placeholder: "e.g. 3.2" },
  { name: "max_voltage_v", label: "Max Voltage (V)", type: "number", required: true, placeholder: "e.g. 3.65" },
  { name: "min_voltage_v", label: "Min Voltage (V)", type: "number", required: true, placeholder: "e.g. 2.5" },
  { name: "weight_g", label: "Weight (g)", type: "number", required: true, placeholder: "e.g. 5500" },
  { name: "dimensions", label: "Dimensions", type: "text", required: true, placeholder: "e.g. 173×71×27 mm" },
  { name: "internal_resistance_spec_mohm", label: "Internal Resistance Spec (mΩ)", type: "number", required: true, placeholder: "e.g. 0.25" },
  { name: "cycle_life", label: "Cycle Life", type: "number", required: true, placeholder: "e.g. 4000" },
  { name: "datasheet_url", label: "Datasheet URL", type: "text", placeholder: "https://..." },
  { name: "approved_supplier", label: "Approved Supplier", type: "text", placeholder: "e.g. Verified Vendor Ltd" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
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
