import {
  useListProductMasters,
  useCreateProductMaster,
  useUpdateProductMaster,
  useToggleProductMasterStatus,
  getListProductMastersQueryKey,
} from "@workspace/api-client-react";
import { ProductMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<ProductMaster>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "chemistry", header: "Chemistry" },
  { accessorKey: "nominal_voltage_v", header: "Voltage (V)" },
  { accessorKey: "capacity_ah", header: "Capacity (Ah)" },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. PRD-48V280" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. OCS 48V 280Ah Battery Pack" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  {
    name: "category",
    label: "Category",
    type: "select",
    required: true,
    options: [
      { label: "Energy Storage", value: "energy_storage" },
      { label: "Battery", value: "Battery" },
      { label: "Inverter", value: "Inverter" },
      { label: "EV Charger", value: "EV Charger" },
    ],
  },
  {
    name: "chemistry",
    label: "Chemistry",
    type: "select",
    required: true,
    options: [
      { label: "LiFePO4", value: "LiFePO4" },
      { label: "NMC", value: "NMC" },
      { label: "LCO", value: "LCO" },
    ],
  },
  { name: "nominal_voltage_v", label: "Nominal Voltage (V)", type: "number", required: true, placeholder: "e.g. 48" },
  { name: "capacity_ah", label: "Capacity (Ah)", type: "number", required: true, placeholder: "e.g. 280" },
  { name: "energy_kwh", label: "Energy (kWh)", type: "number", required: true, placeholder: "e.g. 13.44" },
  { name: "configuration", label: "Configuration", type: "text", required: true, placeholder: "e.g. 16S1P" },
  { name: "cell_count", label: "Cell Count", type: "number", required: true, placeholder: "e.g. 16" },
  { name: "warranty_period_months", label: "Warranty (Months)", type: "number", required: true, placeholder: "e.g. 24" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<ProductMaster> = {
  resource: "products",
  title: "Product Master",
  description: "Manage product definitions and specifications",
  columns,
  fields: fields as any,
};

export default function ProductMasterPage() {
  const hooks = {
    useList: useListProductMasters,
    useCreate: useCreateProductMaster,
    useUpdate: useUpdateProductMaster,
    useToggleStatus: useToggleProductMasterStatus,
    listQueryKey: getListProductMastersQueryKey(),
  };

  return <MasterPage config={config} hooks={hooks} />;
}
