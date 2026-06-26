import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Edit, Power, PowerOff } from "lucide-react";
import { MasterStatusBadge } from "./MasterStatusBadge";

interface MasterDataGridProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onEdit: (item: T) => void;
  onToggleStatus: (id: string, currentStatus: "active" | "inactive") => void;
}

export function MasterDataGrid<T extends { id: string; status: "active" | "inactive" }>({
  data,
  columns,
  onEdit,
  onToggleStatus,
}: MasterDataGridProps<T>) {
  const tableColumns: ColumnDef<T>[] = [
    ...columns,
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => <MasterStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(row.original)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onToggleStatus(
                row.original.id,
                row.original.status === "active" ? "inactive" : "active"
              )
            }
          >
            {row.original.status === "active" ? (
              <PowerOff className="h-4 w-4 text-destructive" />
            ) : (
              <Power className="h-4 w-4 text-primary" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={tableColumns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
