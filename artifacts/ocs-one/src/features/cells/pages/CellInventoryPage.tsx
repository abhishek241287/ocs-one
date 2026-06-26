import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useGetCellInventory, useListCells } from "@workspace/api-client-react";
import { Archive, CheckCircle, XCircle, AlertTriangle, Lock, Cpu, Box } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  received: { label: "Received", className: "bg-gray-100 text-gray-700 border-gray-200" },
  grading: { label: "Grading", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  quarantine: { label: "Quarantine", className: "bg-orange-100 text-orange-800 border-orange-200" },
  reserved: { label: "Reserved", className: "bg-blue-100 text-blue-800 border-blue-200" },
  allocated: { label: "Allocated", className: "bg-purple-100 text-purple-800 border-purple-200" },
};

const GRADE_BADGE: Record<string, string> = {
  A: "bg-green-500 text-white",
  B: "bg-blue-500 text-white",
  C: "bg-yellow-500 text-white",
  reject: "bg-red-500 text-white",
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`p-2 rounded-md ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function CellInventoryPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [grade, setGrade] = useState("all");
  const [page, setPage] = useState(1);

  const { data: inv } = useGetCellInventory();
  const { data, isLoading } = useListCells({
    page,
    pageSize: 50,
    search: search || undefined,
    status: status !== "all" ? (status as any) : undefined,
    grade: grade !== "all" ? (grade as any) : undefined,
  });

  const cells = data?.items ?? [];
  const meta = data?.meta;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="text-primary" size={24} />
            Cell Inventory
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time cell status across all lots
          </p>
        </div>

        {inv && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <StatCard label="Total Cells" value={inv.total} icon={Box} color="bg-gray-500" />
            <StatCard label="Available" value={inv.available} icon={CheckCircle} color="bg-green-500" />
            <StatCard label="Approved" value={inv.approved} icon={CheckCircle} color="bg-emerald-500" />
            <StatCard label="Rejected" value={inv.rejected} icon={XCircle} color="bg-red-500" />
            <StatCard label="Quarantine" value={inv.quarantine} icon={AlertTriangle} color="bg-orange-500" />
            <StatCard label="Reserved" value={inv.reserved} icon={Lock} color="bg-blue-500" />
            <StatCard label="Allocated" value={inv.allocated} icon={Cpu} color="bg-purple-500" />
          </div>
        )}

        {inv && inv.total > 0 && (
          <div className="flex gap-6 mb-6 p-4 rounded-lg border bg-muted/30 text-sm">
            <div>
              <span className="text-muted-foreground">Received Today: </span>
              <strong>{inv.receivedToday}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Graded Today: </span>
              <strong>{inv.gradedToday}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Approved %: </span>
              <strong className="text-green-600">{inv.approvedPct}%</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Rejected %: </span>
              <strong className="text-red-600">{inv.rejectedPct}%</strong>
            </div>
          </div>
        )}

        <div className="flex gap-3 mb-4 flex-wrap">
          <Input
            placeholder="Search cell ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="grading">Grading</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="quarantine">Quarantine</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={(v) => { setGrade(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              <SelectItem value="A">Grade A</SelectItem>
              <SelectItem value="B">Grade B</SelectItem>
              <SelectItem value="C">Grade C</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cell ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Voltage (V)</TableHead>
                <TableHead className="text-right">Capacity (Ah)</TableHead>
                <TableHead className="text-right">IR (mΩ)</TableHead>
                <TableHead>Graded By</TableHead>
                <TableHead>Graded At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading cells...</TableCell>
                </TableRow>
              ) : cells.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No cells found</TableCell>
                </TableRow>
              ) : cells.map((cell) => {
                const sb = STATUS_BADGE[cell.status] ?? STATUS_BADGE.received;
                return (
                  <TableRow key={cell.id}>
                    <TableCell className="font-mono text-xs">{cell.cellId}</TableCell>
                    <TableCell>
                      <Badge className={sb.className}>{sb.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {cell.grade ? (
                        <Badge className={GRADE_BADGE[cell.grade] ?? ""}>{cell.grade}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{cell.voltageV?.toFixed(3) ?? "—"}</TableCell>
                    <TableCell className="text-right">{cell.capacityAh?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-right">{cell.internalResistanceMohm?.toFixed(3) ?? "—"}</TableCell>
                    <TableCell>{cell.gradedBy ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cell.gradedAt ? new Date(cell.gradedAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-sm self-center">Page {page} of {meta.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
