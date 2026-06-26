import { useGetOrderGenealogy } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Battery, Cpu, Box, Minus, Plug, GitBranch } from "lucide-react";

const COMPONENT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  cell: Battery,
  bms: Cpu,
  cabinet: Box,
  busbar: Minus,
  connector: Plug,
};

const COMPONENT_COLORS: Record<string, string> = {
  cell: "bg-green-100 text-green-800 border-green-200",
  bms: "bg-blue-100 text-blue-800 border-blue-200",
  cabinet: "bg-purple-100 text-purple-800 border-purple-200",
  busbar: "bg-orange-100 text-orange-800 border-orange-200",
  connector: "bg-teal-100 text-teal-800 border-teal-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

interface Props { orderId: string; }

export default function GenealogyView({ orderId }: Props) {
  const { data, isLoading } = useGetOrderGenealogy(orderId);
  const records = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 border rounded-lg space-y-2">
        <GitBranch className="h-10 w-10 mx-auto text-gray-300" />
        <p className="text-sm font-medium">No components recorded yet</p>
        <p className="text-xs">Genealogy is auto-built as stages are completed</p>
      </div>
    );
  }

  // Group by component type
  const grouped = records.reduce<Record<string, typeof records>>((acc, r) => {
    const key = r.componentType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const ORDER = ["cell", "bms", "cabinet", "busbar", "connector", "other"];
  const sortedTypes = ORDER.filter((t) => grouped[t]);
  const remainingTypes = Object.keys(grouped).filter((t) => !ORDER.includes(t));

  const allTypes = [...sortedTypes, ...remainingTypes];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-orange-600" />
        <h3 className="font-semibold text-gray-900">Digital Battery Passport — Component BOM</h3>
        <span className="ml-auto text-sm text-gray-500">{records.length} components</span>
      </div>

      {allTypes.map((type) => {
        const items = grouped[type] ?? [];
        const Icon = COMPONENT_ICONS[type] ?? GitBranch;
        const colorClass = COMPONENT_COLORS[type] ?? COMPONENT_COLORS.other;
        return (
          <div key={type} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
                <Icon className="h-3 w-3" />
                {type.toUpperCase()} ({items.length})
              </span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Component</TableHead>
                    <TableHead className="text-xs">Serial / Batch</TableHead>
                    <TableHead className="text-xs text-center">Qty</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="text-xs">Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{r.componentName}</TableCell>
                      <TableCell className="text-sm text-gray-500 font-mono text-xs">{r.serialNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm text-center">{r.quantity}</TableCell>
                      <TableCell className="text-xs text-gray-400">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
