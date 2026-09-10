import {
  Users,
  Grid3x3,
  KeyRound,
  Gauge,
  UserPlus,
  Ban,
  ScrollText,
  ScanLine,
  PackageCheck,
  Lock,
  Award,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { OdsPageLayout, ModuleHeader } from "@/components/ods";
import { Button } from "@/components/ui/button";
import {
  useSecurityDashboard,
  type AuthzOutcome,
  type Principal,
  type SecurityEventRow,
  type DealerAssignmentChange,
} from "@/features/developer/hooks/useSecurityDashboard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function methodColor(method: string | null): string {
  switch (method) {
    case "GET": return "bg-sky-50 text-sky-700";
    case "POST": return "bg-emerald-50 text-emerald-700";
    case "PATCH":
    case "PUT": return "bg-amber-50 text-amber-700";
    case "DELETE": return "bg-red-50 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

const OUTCOME_META: Record<AuthzOutcome, { label: string; cls: string }> = {
  pass: { label: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  forbidden: { label: "403", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  unauthorized: { label: "401", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

function severityCls(sev: string): string {
  switch (sev) {
    case "critical": return "bg-red-50 text-red-700";
    case "warning": return "bg-amber-50 text-amber-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="text-slate-400">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function NotRecorded({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <MinusCircle className="h-4 w-4 text-slate-400" />
      No {what} recorded yet — run the certification pipeline to populate this panel.
    </div>
  );
}

function EventTable({ rows, emptyLabel }: { rows: SecurityEventRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 italic">No {emptyLabel} recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Actor / Target</th>
            <th className="py-2 pr-3 font-medium">Request</th>
            <th className="py-2 pr-3 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fmtTime(r.createdAt)}</td>
              <td className="py-2 pr-3 text-slate-700">
                {r.actorEmail ?? r.targetEmail ?? <span className="text-slate-400">anonymous</span>}
                {r.actorRole && <span className="ml-1 text-slate-400">({r.actorRole})</span>}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {r.method && (
                  <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] ${methodColor(r.method)}`}>
                    {r.method}
                  </span>
                )}
                <span className="ml-1.5 font-mono text-slate-500">{r.path ?? "—"}</span>
                {r.statusCode != null && <span className="ml-1.5 text-slate-400">{r.statusCode}</span>}
              </td>
              <td className="py-2 pr-3 text-slate-500">{r.detail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function dealershipLabel(snapshot: DealerAssignmentChange["previousDealership"]): string {
  if (!snapshot.id) return "Unassigned";
  return snapshot.name ?? snapshot.code ?? snapshot.id;
}

function DealershipCell({ snapshot }: { snapshot: DealerAssignmentChange["previousDealership"] }) {
  return (
    <div>
      <div className="font-medium text-slate-700">{dealershipLabel(snapshot)}</div>
      {snapshot.code && snapshot.name && (
        <div className="text-[11px] text-slate-500 font-mono">{snapshot.code}</div>
      )}
      {snapshot.id && <div className="text-[10px] text-slate-400 font-mono">{snapshot.id}</div>}
    </div>
  );
}

function DealerAssignmentTable({ rows }: { rows: DealerAssignmentChange[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 italic">No dealer-account changes recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Actor</th>
            <th className="py-2 pr-3 font-medium">Target account</th>
            <th className="py-2 pr-3 font-medium">Previous dealership</th>
            <th className="py-2 pr-3 font-medium"><ArrowRight className="inline h-3 w-3 mr-1" />New dealership</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-50 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fmtTime(row.createdAt)}</td>
              <td className="py-2 pr-3 text-slate-700">
                {row.actorEmail ?? "—"}
                {row.actorRole && <span className="ml-1 text-slate-400">({row.actorRole})</span>}
              </td>
              <td className="py-2 pr-3 text-slate-700">{row.targetEmail ?? "—"}</td>
              <td className="py-2 pr-3"><DealershipCell snapshot={row.previousDealership} /></td>
              <td className="py-2 pr-3"><DealershipCell snapshot={row.newDealership} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useSecurityDashboard();

  const header = (
    <ModuleHeader
      icon="🛡️"
      title="Security Posture"
      description="Live security telemetry · RBAC matrix, audit trail, rate limiting, CSP & JWT config, scan summary"
      certification="under-validation"
    />
  );

  if (isError) {
    return (
      <OdsPageLayout header={header}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">
            {error instanceof Error ? error.message : "Failed to load security dashboard"}
          </p>
        </div>
      </OdsPageLayout>
    );
  }

  return (
    <OdsPageLayout
      header={header}
      toolbar={
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {data ? (
              <>
                Updated {new Date(data.generatedAt).toLocaleTimeString()} · auto-refresh 20s ·{" "}
                <span className="text-emerald-600 font-medium">
                  {data.authorizationMatrix.summary.assertions} authz assertions enforced (SS-02)
                </span>
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {isLoading && !data && (
          <div className="text-sm text-slate-400">Loading security telemetry…</div>
        )}

        {data && (
          <>
            {/* ─── 1. Users by role ─────────────────────────────────────── */}
            <SectionCard
              icon={<Users className="h-4 w-4" />}
              title="Users by Role"
              subtitle={`${data.usersByRole.activeTotal} active account(s)`}
            >
              <div className="flex flex-wrap gap-3">
                {["director", "supervisor", "operator", "viewer"].map((role) => (
                  <div key={role} className="rounded-lg border border-slate-200 px-4 py-3 min-w-[120px]">
                    <div className="text-2xl font-semibold text-slate-800">
                      {data.usersByRole.counts[role] ?? 0}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{role}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ─── 2. Authorization matrix ─────────────────────────────── */}
            <SectionCard
              icon={<Grid3x3 className="h-4 w-4" />}
              title="Endpoint Authorization Matrix (SS-02)"
              subtitle={`${data.authorizationMatrix.summary.endpoints} endpoints × ${data.authorizationMatrix.summary.principals} principals — enforced by the automated cert suite`}
            >
              <div className="space-y-5">
                {Object.entries(data.authorizationMatrix.groups).map(([group, endpoints]) => (
                  <div key={group}>
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{group}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100">
                            <th className="py-2 pr-3 font-medium">Endpoint</th>
                            {data.authorizationMatrix.principals.map((p) => (
                              <th key={p} className="py-2 px-2 font-medium text-center capitalize">{p.slice(0, 3)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {endpoints.map((ep) => (
                            <tr key={ep.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-2 pr-3">
                                <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] ${methodColor(ep.method)}`}>
                                  {ep.method}
                                </span>
                                <span className="ml-1.5 font-mono text-slate-600">{ep.path}</span>
                                <div className="text-[11px] text-slate-400 mt-0.5">{ep.guard}</div>
                              </td>
                              {data.authorizationMatrix.principals.map((p: Principal) => {
                                const meta = OUTCOME_META[ep.expected[p]];
                                return (
                                  <td key={p} className="py-2 px-2 text-center">
                                    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                                      {meta.label}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ─── 3. Failed logins ─────────────────────────────────────── */}
            <SectionCard
              icon={<KeyRound className="h-4 w-4" />}
              title="Failed Logins"
              subtitle="Brute-force / credential-stuffing watch"
              right={
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${data.failedLogins.last24h > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {data.failedLogins.last24h} in last 24h
                </span>
              }
            >
              <EventTable rows={data.failedLogins.recent} emptyLabel="failed logins" />
            </SectionCard>

            {/* ─── 4. Rate-limit events ─────────────────────────────────── */}
            <SectionCard
              icon={<Gauge className="h-4 w-4" />}
              title="Rate-Limit Events"
              subtitle="Policies enforced and recent breaches (429)"
            >
              <div className="grid gap-2 sm:grid-cols-3 mb-4">
                {Object.values(data.rateLimitEvents.policies).map((pol) => (
                  <div key={pol.name} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-700">{pol.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {pol.max} req / {Math.round(pol.windowMs / 1000)}s · <span className="font-mono">{pol.scope}</span>
                    </div>
                  </div>
                ))}
              </div>
              <EventTable rows={data.rateLimitEvents.recent} emptyLabel="rate-limit breaches" />
            </SectionCard>

            {/* ─── 5. Account creation log ──────────────────────────────── */}
            <SectionCard
              icon={<UserPlus className="h-4 w-4" />}
              title="Account Creation Log"
              subtitle="Director-only user provisioning (no self-registration)"
            >
              <EventTable rows={data.accountCreations} emptyLabel="account creations" />
            </SectionCard>

            {/* ─── 6. Dealer-account assignment history ─────────────────── */}
            <SectionCard
              icon={<Users className="h-4 w-4" />}
              title="Dealer-Account Changes"
              subtitle="Audited dealership assignment history — actor, target, and before/after dealership snapshots"
              right={
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${data.dealerAssignmentChanges.last7d > 0 ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                  {data.dealerAssignmentChanges.last7d} in last 7 days
                </span>
              }
            >
              <DealerAssignmentTable rows={data.dealerAssignmentChanges.recent} />
            </SectionCard>

            {/* ─── 6. Permission failures (403) ─────────────────────────── */}
            <SectionCard
              icon={<Ban className="h-4 w-4" />}
              title="Permission Failures (403)"
              subtitle="Authorization denials — attempts to exceed role privileges"
            >
              <EventTable rows={data.permissionFailures} emptyLabel="permission failures" />
            </SectionCard>

            {/* ─── 7. Audit activity ────────────────────────────────────── */}
            <SectionCard
              icon={<ScrollText className="h-4 w-4" />}
              title="Audit Activity Feed"
              subtitle="Most recent security-relevant events (append-only)"
            >
              <EventTable rows={data.auditActivity} emptyLabel="audit events" />
            </SectionCard>

            {/* ─── 8. Event counts ──────────────────────────────────────── */}
            <SectionCard
              icon={<ScrollText className="h-4 w-4" />}
              title="Audited Event Counts (7 days)"
              subtitle="Security event volume by type from the audit matrix"
            >
              {data.auditEventCounts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No events recorded in the last 7 days.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.auditEventCounts.map((e) => (
                    <span key={e.eventType} className={`rounded-full px-3 py-1 text-xs ${severityCls("info")}`}>
                      <span title={e.action} className="font-mono">{e.eventType}</span>
                      <span className="ml-1.5 font-semibold text-slate-700">{e.total}</span>
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ─── 9. Security scan summary ─────────────────────────────── */}
            <SectionCard
              icon={<ScanLine className="h-4 w-4" />}
              title="Security Scan Summary"
              subtitle="SAST + privacy (HoundDog) — last recorded run"
              right={
                <span className="text-xs text-slate-400">{fmtTime(data.securityScan.generatedAt)}</span>
              }
            >
              {data.securityScan.recorded ? (
                <pre className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify({ sast: data.securityScan.sast, privacy: data.securityScan.privacy }, null, 2)}
                </pre>
              ) : (
                <NotRecorded what="security scan" />
              )}
            </SectionCard>

            {/* ─── 10. Dependency audit ─────────────────────────────────── */}
            <SectionCard
              icon={<PackageCheck className="h-4 w-4" />}
              title="Dependency Audit"
              subtitle="Known-vulnerability scan of installed packages"
              right={
                <span className="text-xs text-slate-400">{fmtTime(data.dependencyAudit.generatedAt)}</span>
              }
            >
              {data.dependencyAudit.recorded ? (
                <pre className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(data.dependencyAudit.result, null, 2)}
                </pre>
              ) : (
                <NotRecorded what="dependency audit" />
              )}
            </SectionCard>

            {/* ─── 11. CSP status ───────────────────────────────────────── */}
            <SectionCard
              icon={<Lock className="h-4 w-4" />}
              title="Content-Security-Policy"
              subtitle={data.cspStatus.weakened.length > 0
                ? `Enforced · ${data.cspStatus.weakened.length} directive(s) carry 'unsafe' values`
                : "Enforced · no weakened directives"}
            >
              <div className="space-y-1.5">
                {data.cspStatus.directives.map((d) => (
                  <div key={d.directive} className="flex items-start gap-2 text-xs">
                    {d.unsafe ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    )}
                    <span className="font-mono text-slate-600">{d.directive}</span>
                    <span className="font-mono text-slate-400">{d.values.join(" ")}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ─── 12. JWT config + certification status ────────────────── */}
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard
                icon={<KeyRound className="h-4 w-4" />}
                title="JWT / Session Configuration"
                subtitle="How sessions are signed and transported"
              >
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-slate-500">Algorithm</dt>
                  <dd className="font-mono text-slate-700">{data.jwtConfig.algorithm}</dd>
                  <dt className="text-slate-500">Expires in</dt>
                  <dd className="font-mono text-slate-700">{data.jwtConfig.expiresIn}</dd>
                  <dt className="text-slate-500">Transport</dt>
                  <dd className="text-slate-700">{data.jwtConfig.transport}</dd>
                  <dt className="text-slate-500">Cookie</dt>
                  <dd className="font-mono text-slate-700">{data.jwtConfig.cookieName}</dd>
                  <dt className="text-slate-500">httpOnly</dt>
                  <dd>{data.jwtConfig.httpOnly ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</dd>
                  <dt className="text-slate-500">sameSite</dt>
                  <dd className="font-mono text-slate-700">{data.jwtConfig.sameSite}</dd>
                  <dt className="text-slate-500">secure</dt>
                  <dd>{data.jwtConfig.secure ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-amber-600 text-[11px]">dev only</span>}</dd>
                  <dt className="text-slate-500">Secret configured</dt>
                  <dd>{data.jwtConfig.secretConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</dd>
                </dl>
              </SectionCard>

              <SectionCard
                icon={<Award className="h-4 w-4" />}
                title="Certification Status"
                subtitle="Last recorded certification result"
                right={
                  <span className="text-xs text-slate-400">{fmtTime(data.certificationStatus.generatedAt)}</span>
                }
              >
                {data.certificationStatus.recorded ? (
                  <pre className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(data.certificationStatus.result, null, 2)}
                  </pre>
                ) : (
                  <NotRecorded what="certification result" />
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </OdsPageLayout>
  );
}
