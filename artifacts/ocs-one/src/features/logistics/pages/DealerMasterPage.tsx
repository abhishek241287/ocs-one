import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListDealers, useCreateDealer, useUpdateDealer, useDeleteDealer,
  getListDealersQueryKey, Dealer, DealerInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Plus, Pencil, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EMPTY_FORM: Omit<DealerInput, 'creditLimit'> & { creditLimit: string } = {
  dealerCode: "", dealerName: "", gstNumber: "", address: "", contactPerson: "",
  mobile: "", email: "", territory: "", creditLimit: "0", status: "active",
};

export default function DealerMasterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListDealers(search ? { search } : {});
  const createDealer = useCreateDealer();
  const updateDealer = useUpdateDealer();
  const deleteDealer = useDeleteDealer();

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (d: Dealer) => {
    setEditing(d);
    setForm({
      dealerCode: d.dealerCode, dealerName: d.dealerName,
      gstNumber: d.gstNumber ?? "", address: d.address ?? "",
      contactPerson: d.contactPerson ?? "", mobile: d.mobile ?? "",
      email: d.email ?? "", territory: d.territory ?? "",
      creditLimit: String(d.creditLimit ?? "0"),
      status: d.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.dealerCode.trim() || !form.dealerName.trim()) {
      toast({ title: "Dealer code and name are required", variant: "destructive" }); return;
    }
    try {
      const payload: DealerInput = {
        ...form,
        creditLimit: parseFloat(form.creditLimit) || 0,
        gstNumber: form.gstNumber || undefined,
        address: form.address || undefined,
        contactPerson: form.contactPerson || undefined,
        mobile: form.mobile || undefined,
        email: form.email || undefined,
        territory: form.territory || undefined,
      };
      if (editing) {
        await updateDealer.mutateAsync({ id: editing.id, data: payload });
        toast({ title: "Dealer updated" });
      } else {
        await createDealer.mutateAsync({ data: payload });
        toast({ title: "Dealer created" });
      }
      qc.invalidateQueries({ queryKey: getListDealersQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to save dealer", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDealer.mutateAsync({ id });
      toast({ title: "Dealer deleted" });
      qc.invalidateQueries({ queryKey: getListDealersQueryKey() });
      setDeleteId(null);
    } catch {
      toast({ title: "Failed to delete dealer", variant: "destructive" });
    }
  };

  const isSaving = createDealer.isPending || updateDealer.isPending;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-600" />Dealer Master
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage dealer accounts and territories</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Dealer</Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Input placeholder="Search by name, code, territory..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </div>

        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Credit Limit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No dealers found. Create one to get started.</TableCell></TableRow>
                )}
                {data?.items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs font-semibold">{d.dealerCode}</TableCell>
                    <TableCell className="font-medium">{d.dealerName}</TableCell>
                    <TableCell className="text-xs">{d.gstNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.territory ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.contactPerson ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.mobile ?? "—"}</TableCell>
                    <TableCell className="text-xs">₹{Number(d.creditLimit ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "active" ? "default" : "secondary"} className={d.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(d.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Dealer" : "New Dealer"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Dealer Code *</Label><Input value={form.dealerCode} onChange={(e) => setForm((f) => ({ ...f, dealerCode: e.target.value }))} placeholder="DLR-001" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Dealer Name *</Label><Input value={form.dealerName} onChange={(e) => setForm((f) => ({ ...f, dealerName: e.target.value }))} placeholder="Dealer full name" /></div>
            <div className="space-y-1.5"><Label className="text-xs">GST Number</Label><Input value={form.gstNumber} onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))} placeholder="27AADCB..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Territory</Label><Input value={form.territory} onChange={(e) => setForm((f) => ({ ...f, territory: e.target.value }))} placeholder="Maharashtra, North..." /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Full address" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} placeholder="Name" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} placeholder="+91..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="dealer@email.com" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Credit Limit (₹)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} placeholder="500000" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <Select value={form.status ?? "active"} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      {deleteId && (
        <Dialog open onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Dealer</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This will permanently delete the dealer. This cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteId)} disabled={deleteDealer.isPending}>
                {deleteDealer.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
