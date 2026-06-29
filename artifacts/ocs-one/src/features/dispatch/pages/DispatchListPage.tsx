import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { useListDispatches } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, Plus, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ModuleHeader } from "@/components/ods";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

export default function DispatchListPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, isFetching } = useListDispatches({
    search: search || undefined,
    page,
    pageSize,
  } as any);

  const items = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🚚"
          title="Dispatches"
          description="All dispatch documents. Open a dispatch to print its Dispatch Note or reverse it."
          certification="certified"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search dispatch / invoice / dealer…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Link href="/fulfillment/dispatch">
            <Button className="gap-1">
              <Plus className="h-4 w-4" />
              New Dispatch
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              {total} dispatch{total === 1 ? "" : "es"}
            </CardTitle>
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No dispatches found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Dispatch No.</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Dealer</th>
                    <th className="px-4 py-3 font-semibold text-right">Items</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate(`/fulfillment/dispatch/${d.id}`)}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-orange-600">
                        {d.dispatch_number}
                      </td>
                      <td className="px-4 py-3 font-mono">{d.invoice_number}</td>
                      <td className="px-4 py-3">{fmtDate(d.dispatch_date)}</td>
                      <td className="px-4 py-3">{d.dealer_name ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{d.item_count}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={d.status === "reversed" ? "destructive" : "default"}
                          className={
                            d.status === "reversed"
                              ? ""
                              : "bg-green-600 hover:bg-green-600"
                          }
                        >
                          {d.status === "reversed" ? "Reversed" : "Dispatched"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
