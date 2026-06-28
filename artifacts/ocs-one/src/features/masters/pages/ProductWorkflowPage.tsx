import {
  useListProductWorkflows,
  useCreateProductWorkflow,
  useUpdateProductWorkflow,
  useToggleProductWorkflowStatus,
  getListProductWorkflowsQueryKey,
} from "@workspace/api-client-react";
import { ProductWorkflow } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<ProductWorkflow>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
  {
    id: "stages",
    header: "Stages",
    cell: ({ row }) => {
      const seq = row.original.stage_sequence ?? [];
      return (
        <span className="text-xs text-muted-foreground">
          {seq.length > 0 ? `${seq.length} stages` : "—"}
        </span>
      );
    },
  },
];

const fields = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. BATTERY" },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Battery Pack Workflow" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Optional description" },
  { name: "effective_date", label: "Effective Date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes or remarks" },
];

const config: MasterConfig<ProductWorkflow> = {
  resource: "product-workflows",
  title: "Product Workflow",
  description: "Manufacturing workflow definitions (BATTERY, INBUILT_LITHIUM, HYBRID)",
  icon: "🔀",
  certification: "certified",
  columns,
  fields: fields as any,
};

export default function ProductWorkflowPage() {
  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListProductWorkflows,
        useCreate: useCreateProductWorkflow,
        useUpdate: useUpdateProductWorkflow,
        useToggleStatus: useToggleProductWorkflowStatus,
        listQueryKey: getListProductWorkflowsQueryKey(),
      }}
    />
  );
}
