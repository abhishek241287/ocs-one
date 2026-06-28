import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListReworkTickets,
  useUpdateReworkTicket,
  getListReworkTicketsQueryKey,
} from "@workspace/api-client-react";
import { ReworkTicket } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wrench, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";

type StatusFilter = "all" | "open" | "in_progress" | "resolved" | "closed";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

export default function ReworkQueuePage() {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<ReworkTicket | null>(null);
  const [form, setForm] = useState({ assignedTechnician: "", correctiveAction: "", status: "" });

  const { data, isLoading, isError, refetch } = useListReworkTickets(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );
  const updateTicket = useUpdateReworkTicket();

  const openTicket = (ticket: ReworkTicket) => {
    setSelected(ticket);
    setForm({
      assignedTechnician: ticket.assignedTechnician ?? "",
      correctiveAction: ticket.correctiveAction ?? "",
      status: ticket.status,
    });
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await updateTicket.mutateAsync({
        id: selected.id,
        data: {
          status: form.status as any,
          assignedTechnician: form.assignedTechnician || null,
          correctiveAction: form.correctiveAction || null,
        },
      });
      notify.success("Rework ticket updated");
      queryClient.invalidateQueries({ queryKey: getListReworkTicketsQueryKey() });
      setSelected(null);
    } catch {
      notify.error("Failed to update ticket");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="h-6 w-6 text-orange-600" />
              Rework Queue
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Track and resolve battery rework tickets</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["all", "open", "in_progress", "resolved", "closed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Failed to load rework queue.
            </CardContent>
          </Card>
        )}

        {data && (
          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Battery #</TableHead>
                    <TableHead>Failed Tests</TableHead>
                    <TableHead>Failure Reason</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No rework tickets found.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.items.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono text-xs font-semibold text-orange-700">
                        {ticket.ticketNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ticket.batteryNumber}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {ticket.failedTests.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs border-red-300 text-red-700">
                              {t.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{ticket.failureReason}</TableCell>
                      <TableCell className="text-xs">{ticket.assignedTechnician ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status] ?? ""}`}>
                          {ticket.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openTicket(ticket)}>
                          Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Rework Ticket — {selected.ticketNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-xs text-muted-foreground">Battery</p>
                <p className="font-mono text-sm font-semibold">{selected.batteryNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failure Reason</p>
                <p className="text-sm">{selected.failureReason}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned Technician</Label>
                <Input
                  value={form.assignedTechnician}
                  onChange={(e) => setForm((f) => ({ ...f, assignedTechnician: e.target.value }))}
                  placeholder="Technician name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Corrective Action</Label>
                <Textarea
                  value={form.correctiveAction}
                  onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))}
                  placeholder="Describe corrective action taken..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={updateTicket.isPending}>
                {updateTicket.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
