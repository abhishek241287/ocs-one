import { useQueryClient } from "@tanstack/react-query";
import { useOdsNotify } from "@/hooks/use-ods-notify";

interface MutationOptions {
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export function useMasterCrud<_T extends { id: string }>(
  resource: string,
  hooks: {
    useList: any;
    useCreate: any;
    useUpdate: any;
    useToggleStatus: any;
    listQueryKey: any;
  }
) {
  const queryClient = useQueryClient();
  const notify = useOdsNotify();

  const listQuery = hooks.useList();
  const createMutation = hooks.useCreate();
  const updateMutation = hooks.useUpdate();
  const toggleStatusMutation = hooks.useToggleStatus();

  const handleCreate = async (data: any, options?: MutationOptions) => {
    try {
      await createMutation.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      notify.success("Success", { description: "Item created successfully" });
      options?.onSuccess?.();
    } catch (error: any) {
      notify.error("Error", { description: error.message || "Failed to create item" });
      options?.onError?.(error);
    }
  };

  const handleUpdate = async (id: string, data: any, options?: MutationOptions) => {
    try {
      await updateMutation.mutateAsync({ id, data });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      notify.success("Success", { description: "Item updated successfully" });
      options?.onSuccess?.();
    } catch (error: any) {
      notify.error("Error", { description: error.message || "Failed to update item" });
      options?.onError?.(error);
    }
  };

  const handleToggleStatus = async (id: string, status: "active" | "inactive") => {
    try {
      await toggleStatusMutation.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      notify.success("Success", { description: `Item status updated to ${status}` });
    } catch (error: any) {
      notify.error("Error", { description: error.message || "Failed to toggle status" });
    }
  };

  return {
    listQuery,
    createMutation,
    updateMutation,
    toggleStatusMutation,
    handleCreate,
    handleUpdate,
    handleToggleStatus,
  };
}
