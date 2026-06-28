import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListDealers,
  useDealerInventory,
  useDealerDispatchHistory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Store } from "lucide-react";
import { ModuleHeader } from "@/components/ods";

const statusVariant = (s?: string | null) =>
  s === "dispatched"
    ? "default"
    : s === "delivered_to_dealer"
      ? "secondary"
      : "outline";

export default function DealerPortalPage() {
  const [dealerId, setDealerId] = useState("");

  const { data: dealersData } = useListDealers({ pageSize: 500 } as any);
  const dealers = useMemo(() => dealersData?.items ?? [], [dealersData]);

  const enabled = !!dealerId;
  const { data: inv, isLoading: invLoading } = useDealerInventory(dealerId, {
    query: { enabled },
  } as any);
  const { data: hist, isLoading: histLoading } = useDealerDispatchHistory(dealerId, {
    query: { enabled },
  } as any);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🏪"
          title="Dealer Portal"
          description="Read-only view of a dealer's current product inventory and dispatch history, projected directly from the Product Platform."
          certification="certified"
        />

        <Card>
          <CardContent className="pt-6">
            <div className="max-w-sm space-y-1.5">
              <Label className="text-xs">Dealer</Label>
              <Select value={dealerId} onValueChange={setDealerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dealer…" />
                </SelectTrigger>
                <SelectContent>
                  {dealers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No dealers
                    </div>
                  ) : (
                    dealers.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.dealerName} ({d.dealerCode})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!dealerId ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center text-muted-foreground">
              <Store className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm">Select a dealer to view inventory and dispatch history.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="inventory">
            <TabsList>
              <TabsTrigger value="inventory">
                Inventory{inv ? ` (${inv.total})` : ""}
              </TabsTrigger>
              <TabsTrigger value="history">
                Dispatch History{hist ? ` (${hist.total})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inventory">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Current Inventory</CardTitle>
                </CardHeader>
                <CardContent>
                  {invLoading ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !inv || inv.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-10 text-center">
                      No products assigned to this dealer.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Serial</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inv.items.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-orange-600">
                              {p.official_product_serial}
                            </TableCell>
                            <TableCell>{p.category_name ?? "—"}</TableCell>
                            <TableCell>{p.model_name ?? p.model_code ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(p.product_status)}>
                                {p.product_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Dispatch History</CardTitle>
                </CardHeader>
                <CardContent>
                  {histLoading ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !hist || hist.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-10 text-center">
                      No dispatch history for this dealer.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Serial</TableHead>
                          <TableHead>Dispatch No.</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Dispatch Date</TableHead>
                          <TableHead>By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hist.items.map((e) => (
                          <TableRow key={e.event_id}>
                            <TableCell className="font-mono text-orange-600">
                              {e.official_product_serial}
                            </TableCell>
                            <TableCell>{e.dispatch_number ?? "—"}</TableCell>
                            <TableCell>{e.invoice_number ?? "—"}</TableCell>
                            <TableCell>{e.dispatch_date ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.actor}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
