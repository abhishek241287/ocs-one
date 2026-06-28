import {
  useListMaterialWorkflows,
  useCreateMaterialWorkflow,
  useUpdateMaterialWorkflow,
  useToggleMaterialWorkflowStatus,
  getListMaterialWorkflowsQueryKey,
} from "@workspace/api-client-react";
import { MaterialWorkflow } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const ACTION_LABEL: Record<string, string> = {
  INCOMING_INSPECTION: "Incoming Inspection",
  DIRECT_TO_INVENTORY: "Direct to Inventory",
};

const columns: ColumnDef<MaterialWorkflow>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  {
    id: "post_receipt_action",
    header: "Post-Receipt Action",
    accessorFn: (row: any) => ACTION_LABEL[row.post_receipt_action] ?? row.post_receipt_action ?? "—",
  },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. INSPECTED" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Inspected Material Workflow" },
  {
    name: "post_receipt_action",
    label: "Post-Receipt Action",
    type: "select",
    required: true,
    placeholder: "Select an action",
    options: [
      { label: "Incoming Inspection", value: "INCOMING_INSPECTION" },
      { label: "Direct to Inventory", value: "DIRECT_TO_INVENTORY" },
    ],
  },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<MaterialWorkflow> = {
  resource: "material-workflows",
  title: "Material Workflow",
  description: "Receiving workflows — decide whether received material is inspected or goes straight to inventory",
  icon: "🔀",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function MaterialWorkflowPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListMaterialWorkflows,
        useCreate: useCreateMaterialWorkflow,
        useUpdate: useUpdateMaterialWorkflow,
        useToggleStatus: useToggleMaterialWorkflowStatus,
        listQueryKey: getListMaterialWorkflowsQueryKey(),
      }}
    />
  );
}
