import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

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

  const listQuery = hooks.useList();
  const createMutation = hooks.useCreate();
  const updateMutation = hooks.useUpdate();
  const toggleStatusMutation = hooks.useToggleStatus();

  const handleCreate = async (data: any, options?: MutationOptions) => {
    try {
      await createMutation.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      toast({ title: "Success", description: "Item created successfully" });
      options?.onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create item",
        variant: "destructive",
      });
      options?.onError?.(error);
    }
  };

  const handleUpdate = async (id: string, data: any, options?: MutationOptions) => {
    try {
      await updateMutation.mutateAsync({ id, data });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      toast({ title: "Success", description: "Item updated successfully" });
      options?.onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update item",
        variant: "destructive",
      });
      options?.onError?.(error);
    }
  };

  const handleToggleStatus = async (id: string, status: "active" | "inactive") => {
    try {
      await toggleStatusMutation.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: hooks.listQueryKey });
      toast({ title: "Success", description: `Item status updated to ${status}` });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle status",
        variant: "destructive",
      });
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
