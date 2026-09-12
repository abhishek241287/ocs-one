import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ColumnDef } from "@tanstack/react-table";
import { KeyRound, UserRound, UserRoundCog } from "lucide-react";
import { useLocation } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { AUTH_KEY, useAuth } from "@/hooks/use-auth";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import {
  useChangeAuthPassword,
  useListAuthUsers,
  useUpdateAuthUser,
  useUpdateAuthUserDealer,
  useListDealers,
  getListAuthUsersQueryKey,
  type AdminUserUpdateRole,
  type UserAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ModuleHeader,
  OdsDataTable,
  OdsDrawer,
  OdsStatusBadge,
} from "@/components/ods";

const UNASSIGNED = "unassigned";

const ROLE_OPTIONS: Array<{ value: AdminUserUpdateRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "director", label: "Director" },
  { value: "supervisor", label: "Supervisor" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
  { value: "dealer", label: "Dealer" },
];

type AdminAccountFormValues = {
  role: AdminUserUpdateRole;
  isActive: boolean;
  password: string;
  passwordConfirmation: string;
};

type ChangePasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  passwordConfirmation: string;
};

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

function isReLoginResponse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    data?: { error?: unknown } | null;
  };
  if (candidate.status !== 401) return false;

  const message = candidate.data?.error;
  return message !== "Current password is incorrect";
}

export default function UserAccountsPage() {
  const { user } = useAuth();
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const canManage = user?.role === "owner" || user?.role === "director";
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [dealerSelection, setDealerSelection] = useState(UNASSIGNED);
  const [passwordDrawerOpen, setPasswordDrawerOpen] = useState(false);

  const usersQuery = useListAuthUsers({
    query: { enabled: canManage } as any,
  });
  const dealersQuery = useListDealers(
    { status: "active", pageSize: 500 },
    { query: { enabled: canManage } as any },
  );
  const updateUser = useUpdateAuthUser();
  const updateDealer = useUpdateAuthUserDealer();
  const changePassword = useChangeAuthPassword();
  const accountForm = useForm<AdminAccountFormValues>({
    defaultValues: {
      role: "viewer",
      isActive: true,
      password: "",
      passwordConfirmation: "",
    },
  });
  const passwordForm = useForm<ChangePasswordFormValues>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      passwordConfirmation: "",
    },
  });

  const users = usersQuery.data?.items ?? [];
  const selectedUser = users.find((item) => item.id === selectedUserId) ?? null;
  const activeDealers = dealersQuery.data?.items ?? [];
  const accountValues = accountForm.watch();
  const isOwnerAccountLocked =
    selectedUser?.role === "owner" && user?.role !== "owner";
  const selectedRole = accountValues.role;
  const canEditDealerAssignment =
    selectedUser?.role === "dealer" && selectedRole === "dealer";

  useEffect(() => {
    if (!selectedUser) return;
    accountForm.reset({
      role: selectedUser.role,
      isActive: selectedUser.isActive,
      password: "",
      passwordConfirmation: "",
    });
  }, [accountForm, selectedUser?.id, selectedUser?.role, selectedUser?.isActive]);

  useEffect(() => {
    if (passwordDrawerOpen) {
      passwordForm.reset();
    }
  }, [passwordDrawerOpen, passwordForm]);

  const forceReLogin = () => {
    queryClient.setQueryData(AUTH_KEY, null);
    setLocation("/login");
  };

  useEffect(() => {
    const loadError = usersQuery.error ?? dealersQuery.error;
    if (isReLoginResponse(loadError)) {
      forceReLogin();
    }
  }, [dealersQuery.error, usersQuery.error]);

  const openUser = (account: UserAccount) => {
    setSelectedUserId(account.id);
    setDealerSelection(account.dealerId ?? UNASSIGNED);
  };

  const closeDrawer = () => setSelectedUserId(null);

  const saveAccount = async (values: AdminAccountFormValues) => {
    if (!selectedUser || isOwnerAccountLocked) return;

    const accountChanges: {
      role?: AdminUserUpdateRole;
      isActive?: boolean;
      password?: string;
    } = {};
    if (values.role !== selectedUser.role) accountChanges.role = values.role;
    if (values.isActive !== selectedUser.isActive) {
      accountChanges.isActive = values.isActive;
    }
    if (values.password) accountChanges.password = values.password;

    const dealerChanged =
      canEditDealerAssignment &&
      dealerSelection !== (selectedUser.dealerId ?? UNASSIGNED);
    if (Object.keys(accountChanges).length === 0 && !dealerChanged) return;

    try {
      if (Object.keys(accountChanges).length > 0) {
        await updateUser.mutateAsync({
          id: selectedUser.id,
          data: accountChanges,
        });
      }
      if (dealerChanged) {
        await updateDealer.mutateAsync({
          id: selectedUser.id,
          data: { dealerId: dealerSelection === UNASSIGNED ? null : dealerSelection },
        });
      }

      const affectsCurrentSession =
        selectedUser.id === user?.userId &&
        (Object.keys(accountChanges).length > 0 || dealerChanged);
      if (affectsCurrentSession) {
        notify.success("Account changes saved", {
          description:
            "Your existing session was revoked. Please sign in again with your updated account.",
        });
        forceReLogin();
        return;
      }

      await queryClient.invalidateQueries({ queryKey: getListAuthUsersQueryKey() });
      notify.success("Account settings saved", {
        description: `${selectedUser.name}'s account settings were updated. Any existing sessions for this account must sign in again.`,
      });
      closeDrawer();
    } catch (error) {
      if (isReLoginResponse(error)) {
        forceReLogin();
        return;
      }
      notify.error("Could not save account settings", {
        description: apiErrorMessage(error),
      });
    }
  };

  const handleSave = () => {
    void accountForm.handleSubmit(saveAccount)();
  };

  const savePassword = async (values: ChangePasswordFormValues) => {
    try {
      await changePassword.mutateAsync({
        data: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      });
      notify.success("Password changed", {
        description:
          "All existing sessions were revoked. Please sign in again with your new password.",
      });
      setPasswordDrawerOpen(false);
      forceReLogin();
    } catch (error) {
      if (isReLoginResponse(error)) {
        forceReLogin();
        return;
      }
      notify.error("Could not change password", {
        description: apiErrorMessage(error),
      });
    }
  };

  const handlePasswordSave = () => {
    void passwordForm.handleSubmit(savePassword)();
  };

  if (!canManage) {
    return (
      <AppLayout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-amber-900">Access restricted</h1>
          <p className="mt-1 text-sm text-amber-800">
            Only directors and owners can manage user accounts.
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
          description="Manage roles, account status, passwords, and dealer portal access"
          certification="development"
          meta={[
            { label: "Accounts", value: String(usersQuery.data?.total ?? 0) },
            { label: "Active dealerships", value: String(activeDealers.length) },
          ]}
          actions={
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              data-testid="button-change-my-password"
              onClick={() => setPasswordDrawerOpen(true)}
            >
              <KeyRound className="h-4 w-4" />
              Change my password
            </Button>
          }
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
          onSave={handleSave}
          saveLabel="Save account changes"
          isSaving={updateUser.isPending || updateDealer.isPending}
          isSaveDisabled={
            !selectedUser ||
            isOwnerAccountLocked ||
            (!accountForm.formState.isDirty &&
              (!canEditDealerAssignment ||
                dealerSelection === (selectedUser.dealerId ?? UNASSIGNED)))
          }
        >
          {selectedUser && (
            <Form {...accountForm}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSave();
                }}
                className="space-y-5"
              >
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate font-medium">{selectedUser.email}</dd>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{new Date(selectedUser.createdAt).toLocaleDateString()}</dd>
                </dl>

                {isOwnerAccountLocked && (
                  <div
                    className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                    data-testid={`status-owner-account-locked-${selectedUser.id}`}
                  >
                    Only an owner can change an owner account.
                  </div>
                )}

                <div className="space-y-4 border-t pt-4">
                  <FormField
                    control={accountForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isOwnerAccountLocked}
                        >
                          <FormControl>
                            <SelectTrigger data-testid={`select-role-${selectedUser.id}`}>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ROLE_OPTIONS.filter(
                              (option) =>
                                user?.role === "owner" ||
                                option.value !== "owner" ||
                                option.value === selectedUser.role,
                            ).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Directors can assign operational and dealer roles. Owners can
                          assign any role.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={accountForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border p-3">
                        <div className="space-y-1">
                          <FormLabel>Account active</FormLabel>
                          <FormDescription>
                            Inactive accounts cannot sign in.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isOwnerAccountLocked}
                            aria-label={`Account active for ${selectedUser.name}`}
                            data-testid={`switch-account-status-${selectedUser.id}`}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {selectedUser.role === "dealer" ? (
                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="dealer-assignment">Linked dealership</Label>
                    <p className="text-xs text-muted-foreground">
                      Only active dealers are available. Choose Unassigned to remove
                      the portal user&apos;s dealership link.
                    </p>
                    <Select
                      value={dealerSelection}
                      onValueChange={setDealerSelection}
                      disabled={isOwnerAccountLocked || !canEditDealerAssignment}
                    >
                      <SelectTrigger
                        id="dealer-assignment"
                        data-testid={`select-dealer-assignment-${selectedUser.id}`}
                      >
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
                    {!canEditDealerAssignment && (
                      <p className="text-xs text-amber-700">
                        Dealer linking is available while this account keeps the dealer
                        role.
                      </p>
                    )}
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

                <div className="space-y-3 border-t pt-4">
                  <div>
                    <h3 className="text-sm font-medium">Reset password</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Set a new password for this account. This revokes all existing
                      sessions, so the account holder must sign in again.
                    </p>
                  </div>
                  <FormField
                    control={accountForm.control}
                    name="password"
                    rules={{
                      validate: (value) =>
                        !value || value.length >= 8 || "Password must be at least 8 characters",
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Leave blank to keep the current password"
                            disabled={isOwnerAccountLocked}
                            data-testid={`input-reset-password-${selectedUser.id}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={accountForm.control}
                    name="passwordConfirmation"
                    rules={{
                      validate: (value) =>
                        value === accountForm.getValues("password") ||
                        "Passwords must match",
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Repeat the new password"
                            disabled={isOwnerAccountLocked}
                            data-testid={`input-confirm-reset-password-${selectedUser.id}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          )}
        </OdsDrawer>

        <OdsDrawer
          open={passwordDrawerOpen}
          onClose={() => setPasswordDrawerOpen(false)}
          title="Change my password"
          description={user?.email}
          onSave={handlePasswordSave}
          saveLabel="Change password"
          isSaving={changePassword.isPending}
          isSaveDisabled={!passwordForm.formState.isDirty}
        >
          <Form {...passwordForm}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handlePasswordSave();
              }}
              className="space-y-5"
            >
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Changing your password revokes all existing sessions, including this
                one. You will be returned to the sign-in screen after it succeeds.
              </div>
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                rules={{ required: "Current password is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="current-password"
                        data-testid="input-current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                rules={{
                  required: "New password is required",
                  minLength: {
                    value: 8,
                    message: "Password must be at least 8 characters",
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        data-testid="input-new-password"
                      />
                    </FormControl>
                    <FormDescription>Use at least 8 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="passwordConfirmation"
                rules={{
                  validate: (value) =>
                    value === passwordForm.getValues("newPassword") ||
                    "Passwords must match",
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        data-testid="input-confirm-new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </OdsDrawer>
      </div>
    </AppLayout>
  );
}