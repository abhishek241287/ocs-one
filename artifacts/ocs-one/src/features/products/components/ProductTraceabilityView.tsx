import { Link } from "wouter";
import { Loader2, ExternalLink, FileText, Factory, PackageOpen, ClipboardCheck, Boxes, Truck, UserCheck, ShieldCheck, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useGetProductTraceability } from "@workspace/api-client-react";

type Dict = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
}
function fmtDay(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <span className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 hover:underline cursor-pointer font-medium">
        {children}
        <ExternalLink className="h-3 w-3" />
      </span>
    </Link>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-medium text-sm">{value ?? "—"}</p>
    </div>
  );
}

export default function ProductTraceabilityView({ productId }: { productId: string }) {
  const { data, isLoading, error } = useGetProductTraceability(productId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-gray-500">
            {(error as any)?.data?.error ?? "Could not load traceability."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const mfg = (data.manufacturing ?? null) as Dict | null;
  const imported = (data.imported ?? null) as Dict | null;
  const fulfillment = data.fulfillment;
  const packing = (fulfillment.packing ?? null) as Dict | null;
  const dispatches = (fulfillment.dispatches ?? []) as Dict[];
  const customer = (data.customer ?? null) as Dict | null;
  const warranty = (data.warranty ?? null) as Dict | null;

  const order = mfg ? ((mfg.production_order ?? null) as Dict | null) : null;
  const materialIssues = mfg ? ((mfg.material_issues ?? []) as Dict[]) : [];
  const boms = mfg ? ((mfg.boms ?? []) as Dict[]) : [];
  const qc = mfg ? ((mfg.qc ?? null) as Dict | null) : null;
  const qcApproval = qc ? ((qc.approval ?? null) as Dict | null) : null;
  const testResults = qc ? ((qc.test_results ?? []) as Dict[]) : [];

  const warrantyStatusColor: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    expired: "bg-amber-100 text-amber-700",
    void: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-5">
      {/* ── Origin: Manufacturing OR Imported ─────────────────────────────── */}
      {data.is_imported ? (
        <SectionCard icon={<PackageOpen className="h-4 w-4 text-orange-600" />} title="Imported Product Registration">
          {imported ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Serial Source" value={str(imported.serial_source)} />
              <Field label="Category" value={str(imported.category_code)} />
              <Field label="OEM Serial" value={str(imported.oem_serial)} />
              <Field
                label="Source GRN"
                value={
                  imported.source_grn_id ? (
                    <DocLink href={`/inventory/grns/${str(imported.source_grn_id)}`}>
                      {str(imported.grn_number) ?? "GRN"}
                    </DocLink>
                  ) : (
                    "—"
                  )
                }
              />
              {str(imported.notes) && <Field label="Notes" value={str(imported.notes)} />}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No imported registration details recorded.</p>
          )}
        </SectionCard>
      ) : (
        <SectionCard icon={<Factory className="h-4 w-4 text-orange-600" />} title="Manufacturing — Production Order">
          {order ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field
                label="Order Number"
                value={
                  <DocLink href={`/manufacturing/orders/${str(order.id)}`}>
                    {str(order.order_number) ?? "Order"}
                  </DocLink>
                }
              />
              <Field label="Battery Number" value={str(order.battery_number)} />
              <Field label="Status" value={str(order.status)} />
              <Field label="Factory Manager" value={str(order.factory_manager)} />
              <Field label="Planned Start" value={fmtDay(order.planned_start_date)} />
              <Field label="Planned End" value={fmtDay(order.planned_end_date)} />
              <Field label="Created" value={fmtDay(order.created_at)} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Source production order not found.</p>
          )}
        </SectionCard>
      )}

      {/* ── Material Issue Notes / BOM / Materials consumed ────────────────── */}
      {!data.is_imported && materialIssues.length > 0 && (
        <SectionCard icon={<Boxes className="h-4 w-4 text-orange-600" />} title="Material Consumption (MIN → BOM → Materials)">
          <div className="space-y-4">
            {materialIssues.map((min) => {
              const lines = (min.lines ?? []) as Dict[];
              return (
                <div key={str(min.id)} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    <span className="font-mono font-medium">{str(min.min_number)}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                      {str(min.status)}
                    </span>
                    {min.bom_number ? (
                      <span className="text-xs text-gray-500">
                        BOM{" "}
                        <DocLink href={`/masters/boms/${str(min.bom_header_id)}`}>
                          {str(min.bom_number)} rev {str(min.bom_revision)}
                        </DocLink>
                      </span>
                    ) : null}
                    {min.is_reversed ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">reversed</span>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-1.5 pr-3 font-medium">Material</th>
                          <th className="py-1.5 pr-3 font-medium">Required</th>
                          <th className="py-1.5 pr-3 font-medium">Issued</th>
                          <th className="py-1.5 pr-3 font-medium">UoM</th>
                          <th className="py-1.5 pr-3 font-medium">Supplier Batch (GRN)</th>
                          <th className="py-1.5 pr-3 font-medium">Critical</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={str(l.id)} className="border-b last:border-0">
                            <td className="py-1.5 pr-3">
                              <span className="font-medium">{str(l.material_name) ?? "—"}</span>{" "}
                              <span className="text-gray-400 font-mono">{str(l.material_code)}</span>
                            </td>
                            <td className="py-1.5 pr-3">{str(l.required_qty)}</td>
                            <td className="py-1.5 pr-3">{str(l.issued_qty)}</td>
                            <td className="py-1.5 pr-3">{str(l.uom)}</td>
                            <td className="py-1.5 pr-3">
                              {l.grn_id ? (
                                <DocLink href={`/inventory/grns/${str(l.grn_id)}`}>
                                  {str(l.grn_number) ?? "GRN"}
                                </DocLink>
                              ) : (
                                <span className="text-gray-400">
                                  {str(l.supplier_lot_number) ?? "—"}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3">
                              {l.is_critical_component ? "Yes" : "No"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {boms.length > 0 && (
              <p className="text-xs text-gray-500">
                BOM versions:{" "}
                {boms.map((b, i) => (
                  <span key={str(b.bom_header_id)}>
                    {i > 0 && ", "}
                    <DocLink href={`/masters/boms/${str(b.bom_header_id)}`}>
                      {str(b.bom_number)} rev {str(b.bom_revision)}
                    </DocLink>
                  </span>
                ))}
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Quality Control ───────────────────────────────────────────────── */}
      {!data.is_imported && (qcApproval || testResults.length > 0) && (
        <SectionCard icon={<ClipboardCheck className="h-4 w-4 text-orange-600" />} title="Quality Control">
          {qcApproval && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Decision" value={str(qcApproval.decision)} />
              <Field label="Inspector" value={str(qcApproval.inspector_name)} />
              <Field label="Inspector Role" value={str(qcApproval.inspector_role)} />
              <Field label="Approved At" value={fmtDate(qcApproval.approved_at)} />
              {str(qcApproval.remarks) && <Field label="Remarks" value={str(qcApproval.remarks)} />}
            </div>
          )}
          {testResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1.5 pr-3 font-medium">Test</th>
                    <th className="py-1.5 pr-3 font-medium">Result</th>
                    <th className="py-1.5 pr-3 font-medium">Operator</th>
                    <th className="py-1.5 pr-3 font-medium">Equipment</th>
                    <th className="py-1.5 pr-3 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((t, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{str(t.test_type)}</td>
                      <td className="py-1.5 pr-3">{str(t.result)}</td>
                      <td className="py-1.5 pr-3">{str(t.operator_name)}</td>
                      <td className="py-1.5 pr-3">{str(t.test_equipment_name)}</td>
                      <td className="py-1.5 pr-3">{fmtDate(t.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Fulfillment: Packing + Dispatch ───────────────────────────────── */}
      <SectionCard icon={<Truck className="h-4 w-4 text-orange-600" />} title="Fulfillment">
        {packing ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Packed By" value={str(packing.packed_by)} />
            <Field label="Packing Date" value={fmtDay(packing.packing_date ?? packing.created_at)} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">Not yet packed.</p>
        )}
        {dispatches.length > 0 && (
          <div className="space-y-2 pt-2">
            {dispatches.map((d) => (
              <div key={str(d.id)} className="border rounded-lg p-3 flex items-center gap-4 flex-wrap text-sm">
                <DocLink href={`/fulfillment/dispatch/${str(d.id)}`}>
                  {str(d.dispatch_number) ?? "Dispatch"}
                </DocLink>
                <span className="text-gray-500 text-xs">Invoice {str(d.invoice_number) ?? "—"}</span>
                <span className="text-gray-500 text-xs">Dealer {str(d.dealer_name) ?? "—"}</span>
                <span className="text-gray-500 text-xs">{fmtDay(d.dispatch_date)}</span>
                {d.is_reversed ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                    reversed{str(d.reversal_reason) ? `: ${str(d.reversal_reason)}` : ""}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Customer + Warranty ───────────────────────────────────────────── */}
      {(customer || warranty) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SectionCard icon={<UserCheck className="h-4 w-4 text-orange-600" />} title="Customer Registration">
            {customer ? (
              <Link href="/after-sales/registrations">
                <div className="grid grid-cols-2 gap-4 cursor-pointer">
                  <Field label="Registration No." value={str(customer.registration_number)} />
                  <Field label="Customer" value={str(customer.customer_name)} />
                  <Field label="Mobile" value={str(customer.mobile)} />
                  <Field label="Dealer" value={str(customer.dealer_name)} />
                  <Field label="Installed" value={fmtDay(customer.installation_date)} />
                </div>
              </Link>
            ) : (
              <p className="text-sm text-gray-500">Not registered to a customer.</p>
            )}
          </SectionCard>

          <SectionCard icon={<ShieldCheck className="h-4 w-4 text-orange-600" />} title="Warranty">
            {warranty ? (
              <Link href="/after-sales/warranties">
                <div className="grid grid-cols-2 gap-4 cursor-pointer">
                  <Field label="Warranty No." value={str(warranty.warranty_number)} />
                  <Field
                    label="Status"
                    value={
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          warrantyStatusColor[str(warranty.status) ?? ""] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {str(warranty.status)}
                      </span>
                    }
                  />
                  <Field label="Start" value={fmtDay(warranty.start_date)} />
                  <Field label="End" value={fmtDay(warranty.end_date)} />
                  <Field label="Period (months)" value={str(warranty.period_months)} />
                </div>
              </Link>
            ) : (
              <p className="text-sm text-gray-500">No warranty issued.</p>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── Unified chronological lifecycle timeline ──────────────────────── */}
      <SectionCard icon={<FileText className="h-4 w-4 text-orange-600" />} title="Lifecycle Timeline">
        {data.timeline.length === 0 ? (
          <p className="text-sm text-gray-500">No timeline events recorded.</p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2 space-y-4">
            {data.timeline.map((e, i) => (
              <li key={i} className="ml-4">
                <span
                  className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${
                    e.source === "manufacturing" ? "bg-blue-400" : "bg-orange-400"
                  }`}
                >
                  <Circle className="h-0 w-0" />
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">
                    {e.event_type.replace(/[._]/g, " ")}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDate(e.timestamp)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.source === "manufacturing"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-orange-50 text-orange-600"
                    }`}
                  >
                    {e.source}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{e.description}</p>
                <p className="text-[11px] text-gray-400">by {e.actor}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
