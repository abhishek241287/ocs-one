import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListCustomerRegistrations,
  useCreateCustomerRegistration,
  useListDealers,
  getListCustomerRegistrationsQueryKey,
} from "@workspace/api-client-react";
import type { CustomerRegistrationInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, UserPlus, Search } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";

const today = () => new Date().toISOString().split("T")[0];

export default function CustomerRegistrationPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const { data, isLoading } = useListCustomerRegistrations({ pageSize: 50, search: search || undefined });
  const { data: dealersData } = useListDealers();
  const createRegistration = useCreateCustomerRegistration();

  const dealers = useMemo(() => dealersData?.items ?? [], [dealersData]);

  const [form, setForm] = useState({
    productSerial: "",
    customerName: "",
    mobile: "",
    address: "",
    dealerId: "",
    installationDate: today(),
  });
  const set = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const reset = () =>
    setForm({
      productSerial: "",
      customerName: "",
      mobile: "",
      address: "",
      dealerId: "",
      installationDate: today(),
    });

  const handleSubmit = async () => {
    if (!form.productSerial.trim()) {
      notify.error("Product serial is required");
      return;
    }
    if (!form.customerName.trim()) {
      notify.error("Customer name is required");
      return;
    }
    if (!form.mobile.trim()) {
      notify.error("Mobile number is required");
      return;
    }
    if (!form.address.trim()) {
      notify.error("Address is required");
      return;
    }
    if (!form.installationDate) {
      notify.error("Installation date is required");
      return;
    }

    const payload: CustomerRegistrationInput = {
      product_serial: form.productSerial.trim(),
      customer_name: form.customerName.trim(),
      mobile: form.mobile.trim(),
      address: form.address.trim(),
      installation_date: form.installationDate,
    };
    if (form.dealerId) payload.dealer_id = form.dealerId;

    try {
      const result = await createRegistration.mutateAsync({ data: payload });
      notify.success(`Registered ${result.registration_number}`, {
        description: `Warranty ${result.warranty.warranty_number} · valid to ${result.warranty.end_date}`,
      });
      reset();
      qc.invalidateQueries({ queryKey: getListCustomerRegistrationsQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? e?.message ?? "Failed to register customer");
    }
  };

  const items = data?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🧾"
          title="Customer Registration"
          description="Register the end customer for a dispatched product. Registration mints the product warranty from the installation date. Works for all product types."
          certification="certified"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-sm">New Registration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Product Serial *</Label>
                <Input
                  value={form.productSerial}
                  onChange={(e) => set("productSerial", e.target.value)}
                  placeholder="Official product serial"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The product must already be dispatched.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer Name *</Label>
                <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mobile *</Label>
                <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address *</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dealer</Label>
                <Select value={form.dealerId} onValueChange={(v) => set("dealerId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dealer (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.dealerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Installation Date *</Label>
                <Input
                  type="date"
                  value={form.installationDate}
                  onChange={(e) => set("installationDate", e.target.value)}
                />
              </div>
              <Button className="w-full gap-1" onClick={handleSubmit} disabled={createRegistration.isPending}>
                {createRegistration.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Register Customer
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 h-fit">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Registrations ({items.length})</CardTitle>
              <div className="relative w-56">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search serial / customer"
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No registrations yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reg #</TableHead>
                      <TableHead>Product Serial</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Installed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.registration_number}</TableCell>
                        <TableCell className="font-mono text-xs text-orange-600">
                          {r.product_serial ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.customer_name}</TableCell>
                        <TableCell className="text-sm">{r.mobile}</TableCell>
                        <TableCell className="text-sm">{r.installation_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
