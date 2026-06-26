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
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  {
    name: "category",
    label: "Category",
    type: "select",
    options: [
      { label: "Battery", value: "Battery" },
      { label: "Inverter", value: "Inverter" },
      { label: "EV Charger", value: "EV Charger" },
    ],
  },
  {
    name: "chemistry",
    label: "Chemistry",
    type: "select",
    options: [
      { label: "LiFePO4", value: "LiFePO4" },
      { label: "NMC", value: "NMC" },
      { label: "LCO", value: "LCO" },
    ],
  },
  { name: "nominal_voltage_v", label: "Nominal Voltage (V)", type: "number" },
  { name: "capacity_ah", label: "Capacity (Ah)", type: "number" },
  { name: "energy_kwh", label: "Energy (kWh)", type: "number" },
  { name: "configuration", label: "Configuration (e.g. 16S2P)", type: "text" },
  { name: "cell_count", label: "Cell Count", type: "number" },
  { name: "warranty_period_months", label: "Warranty (Months)", type: "number" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
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
