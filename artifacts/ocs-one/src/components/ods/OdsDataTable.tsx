/**
 * ODS Standard Data Table
 * The universal table for OCS One. No module should build its own.
 *
 * Features: sorting, column visibility, density, sticky header,
 * row selection, row actions, loading skeleton, empty state, pagination.
 */
import { useState, useCallback } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
  AlignJustify,
} from "lucide-react";
import { OdsTableSkeleton } from "./OdsTableSkeleton";
import { OdsEmptyState } from "./OdsEmptyState";
import { cn } from "@/lib/utils";

// ─── Density ────────────────────────────────────────────────────────────────

type Density = "compact" | "default" | "comfortable";

const DENSITY_ROW: Record<Density, string> = {
  compact: "h-8",
  default: "h-11",
  comfortable: "h-14",
};
const DENSITY_CELL: Record<Density, string> = {
  compact: "py-1 text-xs",
  default: "py-2 text-sm",
  comfortable: "py-3 text-sm",
};
const DENSITY_LABEL: Record<Density, string> = {
  compact: "Compact",
  default: "Default",
  comfortable: "Comfortable",
};

// ─── Pagination ──────────────────────────────────────────────────────────────

interface PaginationConfig {
  pageIndex: number; // 0-based
  pageSize: number;
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface OdsDataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];

  // Loading / empty
  isLoading?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };

  // Row interaction
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  selectedId?: string | null;

  // Row actions appended as last column
  rowActions?: (row: T) => React.ReactNode;

  // Pagination (server-side)
  pagination?: PaginationConfig;

  // Features
  enableSorting?: boolean;
  enableColumnVisibility?: boolean;
  enableDensity?: boolean;
  defaultDensity?: Density;
  stickyHeader?: boolean;

  // Extras
  toolbar?: React.ReactNode;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OdsDataTable<T extends object>({
  data,
  columns,
  isLoading = false,
  emptyIcon = "📋",
  emptyTitle = "No records found",
  emptyDescription,
  emptyAction,
  onRowClick,
  getRowId,
  selectedId,
  rowActions,
  pagination,
  enableSorting = true,
  enableColumnVisibility = true,
  enableDensity = true,
  defaultDensity = "default",
  stickyHeader = false,
  toolbar,
  className,
}: OdsDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState<Density>(defaultDensity);

  // Append row-actions column if provided
  const resolvedColumns: ColumnDef<T>[] = rowActions
    ? [
        ...columns,
        {
          id: "__actions",
          header: "",
          cell: ({ row }) => (
            <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
              {rowActions(row.original)}
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          size: 80,
        },
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getRowId,
    manualPagination: !!pagination,
    pageCount: pagination ? Math.ceil(pagination.total / pagination.pageSize) : undefined,
  });

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination ? pagination.pageIndex + 1 : 1;
  const colCount = table.getAllColumns().length;

  const getRowSelected = useCallback(
    (row: T): boolean => {
      if (!selectedId || !getRowId) return false;
      return getRowId(row) === selectedId;
    },
    [selectedId, getRowId]
  );

  // ── Feature buttons (density + column visibility) ──
  const featureButtons = (
    <div className="flex items-center gap-1">
      {enableDensity && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <AlignJustify className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{DENSITY_LABEL[density]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Row density</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["compact", "default", "comfortable"] as Density[]).map((d) => (
              <DropdownMenuCheckboxItem
                key={d}
                checked={density === d}
                onCheckedChange={() => setDensity(d)}
              >
                {DENSITY_LABEL[d]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {enableColumnVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(v)}
                >
                  {String(col.columnDef.header ?? col.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {/* Optional toolbar + feature buttons */}
      {(toolbar || enableColumnVisibility || enableDensity) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">{toolbar}</div>
          {featureButtons}
        </div>
      )}

      {/* Table */}
      <div className={cn("rounded-lg border bg-white shadow-sm overflow-hidden", stickyHeader && "overflow-auto max-h-[70vh]")}>
        {isLoading ? (
          <OdsTableSkeleton rows={6} columns={colCount} />
        ) : data.length === 0 ? (
          <OdsEmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          <Table>
            <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-gray-50")}>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-gray-50 hover:bg-gray-50">
                  {hg.headers.map((header) => {
                    const canSort = enableSorting && header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "font-semibold text-gray-700 select-none whitespace-nowrap",
                          canSort && "cursor-pointer hover:text-gray-900"
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        {header.isPlaceholder ? null : (
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              <span className="text-gray-400">
                                {sorted === "asc" ? (
                                  <ArrowUp className="h-3.5 w-3.5 text-gray-600" />
                                ) : sorted === "desc" ? (
                                  <ArrowDown className="h-3.5 w-3.5 text-gray-600" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 opacity-40" />
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = getRowSelected(row.original);
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(
                      DENSITY_ROW[density],
                      onRowClick && "cursor-pointer",
                      isSelected
                        ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                        : "hover:bg-gray-50/80"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={DENSITY_CELL[density]}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {pagination && !isLoading && data.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground text-xs">
            {pagination.total === 0
              ? "No records"
              : `${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  pagination.total
                )} of ${pagination.total}`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => pagination.onPageChange(0)}
              disabled={pagination.pageIndex === 0}
              title="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => pagination.onPageChange(pagination.pageIndex - 1)}
              disabled={pagination.pageIndex === 0}
              title="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => pagination.onPageChange(pagination.pageIndex + 1)}
              disabled={currentPage >= totalPages}
              title="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => pagination.onPageChange(totalPages - 1)}
              disabled={currentPage >= totalPages}
              title="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
