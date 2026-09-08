import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { UserRound, UserRoundCog } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import {
  useListAuthUsers,
  useUpdateAuthUserDealer,
  useListDealers,
  getListAuthUsersQueryKey,
  type UserAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ModuleHeader,
  OdsDataTable,
  OdsDrawer,
  OdsStatusBadge,
} from "@/components/ods";

const UNASSIGNED = "unassigned";

const COLUMNS: ColumnDef<UserAccount>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground">{row.original.email}</div>
      </div>
    ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (
      <span className="capitalize text-xs font-medium">{row.original.role}</span>
    ),
  },
  {
    accessorKey: "dealerId",
    header: "Dealership",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.role === "dealer"
          ? row.original.dealerId
            ? "Assigned"
            : "Unassigned"
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <OdsStatusBadge status={row.original.isActive ? "active" : "inactive"} />
    ),
  },
];

function apiErrorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error ?? (error instanceof Error ? error.message : "Request failed");
}

export default function UserAccountsPage() {
  const { user } = useAuth();
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const canManage = user?.role === "owner" || user?.role === "director";
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [dealerSelection, setDealerSelection] = useState(UNASSIGNED);

  const usersQuery = useListAuthUsers({
    query: { enabled: canManage } as any,
  });
  const dealersQuery = useListDealers(
    { status: "active", pageSize: 500 },
    { query: { enabled: canManage } as any },
  );
  const updateDealer = useUpdateAuthUserDealer();

  const users = usersQuery.data?.items ?? [];
  const selectedUser = users.find((item) => item.id === selectedUserId) ?? null;
  const activeDealers = dealersQuery.data?.items ?? [];

  const openUser = (account: UserAccount) => {
    setSelectedUserId(account.id);
    setDealerSelection(account.dealerId ?? UNASSIGNED);
  };

  const closeDrawer = () => setSelectedUserId(null);

  const handleSave = async () => {
    if (!selectedUser || selectedUser.role !== "dealer") return;

    try {
      await updateDealer.mutateAsync({
        id: selectedUser.id,
        data: { dealerId: dealerSelection === UNASSIGNED ? null : dealerSelection },
      });
      await queryClient.invalidateQueries({ queryKey: getListAuthUsersQueryKey() });
      notify.success("Dealership assignment saved", {
        description: `${selectedUser.name}'s dealer portal access is now linked to the selected dealership.`,
      });
      closeDrawer();
    } catch (error) {
      notify.error("Could not save dealership assignment", {
        description: apiErrorMessage(error),
      });
    }
  };

  if (!canManage) {
    return (
      <AppLayout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-amber-900">Access restricted</h1>
          <p className="mt-1 text-sm text-amber-800">
            Only directors and owners can manage user dealership assignments.
          </p>
        </div>
      </AppLayout>
    );
  }

  const isLoading = usersQuery.isLoading || dealersQuery.isLoading;
  const loadError = usersQuery.error ?? dealersQuery.error;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon={<UserRound className="h-5 w-5" />}
          title="User Accounts"
          description="Manage access and link dealer portal users to active dealerships"
          certification="development"
          meta={[
            { label: "Accounts", value: String(usersQuery.data?.total ?? 0) },
            { label: "Active dealerships", value: String(activeDealers.length) },
          ]}
        />

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-medium text-red-800">
              Could not load user accounts
            </p>
            <p className="mt-1 text-xs text-red-700">{apiErrorMessage(loadError)}</p>
          </div>
        ) : (
          <OdsDataTable
            data={users}
            columns={COLUMNS}
            isLoading={isLoading}
            emptyIcon="👥"
            emptyTitle="No user accounts found"
            emptyDescription="User accounts provisioned by an administrator will appear here."
            onRowClick={openUser}
            getRowId={(account) => account.id}
            selectedId={selectedUserId}
            rowActions={(account) => (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => openUser(account)}
              >
                <UserRoundCog className="h-3.5 w-3.5" />
                Details
              </Button>
            )}
            enableSorting
            enableColumnVisibility
            enableDensity
          />
        )}

        <OdsDrawer
          open={!!selectedUser}
          onClose={closeDrawer}
          title={selectedUser ? `${selectedUser.name}'s account` : "Account details"}
          description={selectedUser?.email}
          onSave={selectedUser?.role === "dealer" ? handleSave : undefined}
          saveLabel="Save assignment"
          isSaving={updateDealer.isPending}
          isSaveDisabled={
            !selectedUser ||
            selectedUser.role !== "dealer" ||
            dealerSelection === (selectedUser.dealerId ?? UNASSIGNED)
          }
        >
          {selectedUser && (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="capitalize font-medium">{selectedUser.role}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{selectedUser.isActive ? "Active" : "Inactive"}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(selectedUser.createdAt).toLocaleDateString()}</dd>
              </dl>

              {selectedUser.role === "dealer" ? (
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="dealer-assignment">Linked dealership</Label>
                  <p className="text-xs text-muted-foreground">
                    Only active dealers are available. Choose Unassigned to remove
                    the portal user&apos;s dealership link.
                  </p>
                  <Select value={dealerSelection} onValueChange={setDealerSelection}>
                    <SelectTrigger id="dealer-assignment">
                      <SelectValue placeholder="Select an active dealership" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {activeDealers.map((dealer) => (
                        <SelectItem key={dealer.id} value={dealer.id}>
                          {dealer.dealerName} ({dealer.dealerCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeDealers.length === 0 && (
                    <p className="text-xs text-amber-700">
                      No active dealerships are available. Activate a dealer in Dealer
                      Master before assigning this account.
                    </p>
                  )}
                </div>
              ) : (
                <p className="border-t pt-4 text-xs text-muted-foreground">
                  Dealership linking is available only for dealer-role accounts.
                </p>
              )}
            </div>
          )}
        </OdsDrawer>
      </div>
    </AppLayout>
  );
}