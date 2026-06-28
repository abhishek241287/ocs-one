import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListMaterialCategories,
  useListMaterialWorkflows,
  useListMaterialWorkflowAssignments,
  useUpsertMaterialWorkflowAssignment,
  getListMaterialWorkflowAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";

const DIRECT_DEFAULT = "Direct to Inventory (default)";

export default function MaterialWorkflowAssignmentPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: categoriesData, isLoading: catLoading } = useListMaterialCategories();
  const { data: workflowsData } = useListMaterialWorkflows();
  const { data: assignmentsData } = useListMaterialWorkflowAssignments();
  const upsert = useUpsertMaterialWorkflowAssignment();

  const workflows = useMemo(
    () => (workflowsData?.items ?? []).filter((w: any) => w.status === "active"),
    [workflowsData]
  );

  const assignedByCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (assignmentsData?.items ?? []) as any[]) {
      map.set(a.category_id, a.workflow_id);
    }
    return map;
  }, [assignmentsData]);

  const categories = useMemo(
    () => (categoriesData?.items ?? []).filter((c: any) => c.status === "active"),
    [categoriesData]
  );

  const handleSave = async (categoryId: string) => {
    const workflowId = drafts[categoryId];
    if (!workflowId) return;
    setSavingId(categoryId);
    try {
      await upsert.mutateAsync({ data: { category_id: categoryId, workflow_id: workflowId } });
      notify.success("Workflow assignment saved");
      qc.invalidateQueries({ queryKey: getListMaterialWorkflowAssignmentsQueryKey() });
      setDrafts((p) => {
        const next = { ...p };
        delete next[categoryId];
        return next;
      });
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to save assignment");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🧭"
          title="Material Workflow Assignment"
          description="Map each material category to a receiving workflow. Unassigned categories default to Direct to Inventory."
          certification="certified"
        />

        <Card>
          <CardContent className="p-0">
            {catLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No material categories found. Create categories in the Material Categories master first.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Assigned Workflow</th>
                    <th className="px-4 py-3 font-semibold w-32">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c: any) => {
                    const assigned = assignedByCategory.get(c.id);
                    const draft = drafts[c.id];
                    const current = draft ?? assigned ?? "";
                    const dirty = draft !== undefined && draft !== assigned;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={current}
                            onValueChange={(v) => setDrafts((p) => ({ ...p, [c.id]: v }))}
                          >
                            <SelectTrigger className="max-w-xs">
                              <SelectValue placeholder={DIRECT_DEFAULT} />
                            </SelectTrigger>
                            <SelectContent>
                              {workflows.map((w: any) => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name} ({w.post_receipt_action === "INCOMING_INSPECTION" ? "Inspection" : "Direct"})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!dirty || savingId === c.id}
                            onClick={() => handleSave(c.id)}
                            className="gap-1 h-8 text-xs"
                          >
                            {savingId === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
