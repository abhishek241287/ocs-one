import {
  SlidersHorizontal,
  Server,
  KeyRound,
  Cookie,
  Gauge,
  Lock,
  Globe,
  Flag,
  Factory,
  BatteryCharging,
  Layers,
  Tag,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ShieldCheck,
} from "lucide-react";
import { OdsPageLayout, ModuleHeader } from "@/components/ods";
import { Button } from "@/components/ui/button";
import {
  useConfigurationDashboard,
  type ConfigStatus,
  type ConfigCheck,
} from "@/features/developer/hooks/useConfigurationDashboard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<ConfigStatus, { icon: React.ReactNode; cls: string; label: string }> = {
  pass: {
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "PASS",
  },
  warn: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    label: "WARN",
  },
  fail: {
    icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    cls: "bg-red-50 text-red-700 border-red-200",
    label: "FAIL",
  },
};

function BoolPill({ value, trueLabel, falseLabel }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <CheckCircle2 className="h-4 w-4" /> {trueLabel ?? "yes"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-500">
      <XCircle className="h-4 w-4" /> {falseLabel ?? "no"}
    </span>
  );
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

function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-700">{children}</dd>
    </>
  );
}

function CheckTable({ checks }: { checks: ConfigCheck[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Check</th>
            <th className="py-2 pr-3 font-medium">Expected</th>
            <th className="py-2 pr-3 font-medium">Actual</th>
            <th className="py-2 pr-3 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const meta = STATUS_META[c.status];
            return (
              <tr key={c.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 pr-3">
                  <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-700">{c.label}</td>
                <td className="py-2 pr-3 font-mono text-slate-500">{c.expected}</td>
                <td className="py-2 pr-3 font-mono text-slate-500">{c.actual}</td>
                <td className="py-2 pr-3 text-slate-500">{c.message}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useConfigurationDashboard();

  const header = (
    <ModuleHeader
      icon="⚙️"
      title="Configuration Integrity"
      description="Live engineering configuration · JWT, cookie, rate limits, CSP, CORS, manufacturing, grading & charging — verified by the SS-04 cert suite"
      certification="under-validation"
    />
  );

  if (isError) {
    return (
      <OdsPageLayout header={header}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">
            {error instanceof Error ? error.message : "Failed to load configuration dashboard"}
          </p>
        </div>
      </OdsPageLayout>
    );
  }

  const summary = data?.validation.summary;
  const checksByGroup: Record<string, ConfigCheck[]> = {};
  if (data) {
    for (const c of data.validation.checks) {
      (checksByGroup[c.group] ??= []).push(c);
    }
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
                {summary && summary.drift ? (
                  <span className="text-red-600 font-medium">
                    configuration drift detected ({summary.failed} fail) — SS-04 FAIL
                  </span>
                ) : (
                  <span className="text-emerald-600 font-medium">
                    no drift · {summary?.passed} checks pass (SS-04)
                  </span>
                )}
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
        {isLoading && !data && <div className="text-sm text-slate-400">Loading configuration…</div>}

        {data && summary && (
          <>
            {/* ─── Validation status banner ─────────────────────────────── */}
            <div
              className={`rounded-xl border p-5 ${
                summary.drift ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <div className="flex items-center gap-3">
                {summary.drift ? (
                  <XCircle className="h-7 w-7 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-7 w-7 text-emerald-500 shrink-0" />
                )}
                <div>
                  <h2 className={`text-sm font-semibold ${summary.drift ? "text-red-800" : "text-emerald-800"}`}>
                    {summary.drift
                      ? "Configuration drift detected — SS-04 certification would FAIL"
                      : "Configuration integrity verified — no drift (SS-04)"}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {summary.passed} pass · {summary.warnings} warn · {summary.failed} fail across{" "}
                    {summary.total} checks
                  </p>
                </div>
              </div>
            </div>

            {/* ─── Validation results (grouped) ─────────────────────────── */}
            <SectionCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Configuration Validation (SS-04)"
              subtitle="Required exists · within range · no unsafe default · no duplicate · no conflict"
            >
              <div className="space-y-5">
                {Object.entries(checksByGroup).map(([group, list]) => (
                  <div key={group}>
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{group}</h4>
                    <CheckTable checks={list} />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ─── Environment summary ──────────────────────────────────── */}
            <SectionCard
              icon={<Server className="h-4 w-4" />}
              title="Environment Summary"
              subtitle={`NODE_ENV = ${data.snapshot.environment.nodeEnv}`}
            >
              <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs sm:grid-cols-4">
                <DefRow label="Environment">{data.snapshot.environment.nodeEnv}</DefRow>
                <DefRow label="Production">
                  <BoolPill value={data.snapshot.environment.isProduction} />
                </DefRow>
                <DefRow label="SESSION_SECRET">
                  <BoolPill value={data.snapshot.environment.sessionSecretConfigured} trueLabel="set" falseLabel="missing" />
                </DefRow>
                <DefRow label="DATABASE_URL">
                  <BoolPill value={data.snapshot.environment.databaseUrlConfigured} trueLabel="set" falseLabel="missing" />
                </DefRow>
                <DefRow label="Admin credentials">
                  <BoolPill
                    value={!data.snapshot.environment.adminUsingKnownDefault}
                    trueLabel="custom"
                    falseLabel="default in use"
                  />
                </DefRow>
                <DefRow label="trust proxy">{data.snapshot.environment.trustProxy}</DefRow>
                <DefRow label="ALLOWED_ORIGINS">
                  <BoolPill value={data.snapshot.environment.allowedOriginsConfigured} trueLabel="set" falseLabel="none" />
                </DefRow>
              </dl>
            </SectionCard>

            {/* ─── JWT + Cookie ─────────────────────────────────────────── */}
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard icon={<KeyRound className="h-4 w-4" />} title="JWT Settings" subtitle="Session signing & transport">
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <DefRow label="Algorithm">{data.snapshot.jwt.algorithm}</DefRow>
                  <DefRow label="Expires in">{data.snapshot.jwt.expiresIn}</DefRow>
                  <DefRow label="Transport">{data.snapshot.jwt.transport}</DefRow>
                  <DefRow label="Secret configured">
                    <BoolPill value={data.snapshot.jwt.secretConfigured} />
                  </DefRow>
                </dl>
              </SectionCard>

              <SectionCard icon={<Cookie className="h-4 w-4" />} title="Cookie Settings" subtitle="Session cookie attributes">
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <DefRow label="Name">{data.snapshot.cookie.name}</DefRow>
                  <DefRow label="Max age">{Math.round(data.snapshot.cookie.maxAgeMs / 3_600_000)}h</DefRow>
                  <DefRow label="httpOnly">
                    <BoolPill value={data.snapshot.cookie.httpOnly} />
                  </DefRow>
                  <DefRow label="sameSite">{data.snapshot.cookie.sameSite}</DefRow>
                  <DefRow label="secure">
                    <BoolPill value={data.snapshot.cookie.secure} falseLabel="dev only" />
                  </DefRow>
                  <DefRow label="path">{data.snapshot.cookie.path}</DefRow>
                </dl>
              </SectionCard>
            </div>

            {/* ─── Rate limits ──────────────────────────────────────────── */}
            <SectionCard icon={<Gauge className="h-4 w-4" />} title="Rate Limits" subtitle="Enforced limiter policies">
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.values(data.snapshot.rateLimits).map((pol) => (
                  <div key={pol.name} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-700">{pol.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {pol.max} req / {Math.round(pol.windowMs / 1000)}s · <span className="font-mono">{pol.scope}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ─── CSP + CORS ───────────────────────────────────────────── */}
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard
                icon={<Lock className="h-4 w-4" />}
                title="Content-Security-Policy"
                subtitle={
                  data.snapshot.csp.weakened.length > 0
                    ? `${data.snapshot.csp.weakened.length} directive(s) carry 'unsafe' values`
                    : "No weakened directives"
                }
              >
                <div className="space-y-1.5">
                  {data.snapshot.csp.directives.map((d) => (
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

              <SectionCard
                icon={<Globe className="h-4 w-4" />}
                title="CORS"
                subtitle={data.snapshot.cors.configured ? `${data.snapshot.cors.origins.length} allowed origin(s)` : "Not configured (same-origin only)"}
              >
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <DefRow label="Credentials">
                    <BoolPill value={data.snapshot.cors.credentials} />
                  </DefRow>
                  <DefRow label="Wildcard origin">
                    <BoolPill value={!data.snapshot.cors.wildcard} trueLabel="no" falseLabel="yes (unsafe)" />
                  </DefRow>
                  <dt className="text-slate-500">Origins</dt>
                  <dd className="font-mono text-slate-700 break-all">
                    {data.snapshot.cors.origins.length > 0 ? data.snapshot.cors.origins.join(", ") : "(none)"}
                  </dd>
                </dl>
              </SectionCard>
            </div>

            {/* ─── Feature flags ────────────────────────────────────────── */}
            <SectionCard
              icon={<Flag className="h-4 w-4" />}
              title="Feature Flags"
              subtitle="Runtime feature toggles"
            >
              {data.snapshot.featureFlags.count === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <MinusCircle className="h-4 w-4 text-slate-400" />
                  No feature flags defined — behaviour is governed by RBAC roles and NODE_ENV.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.snapshot.featureFlags.defined.map((f) => (
                    <span key={f} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono text-slate-600">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ─── Manufacturing config ─────────────────────────────────── */}
            <SectionCard
              icon={<Factory className="h-4 w-4" />}
              title="Manufacturing Configuration"
              subtitle={`${data.snapshot.manufacturing.stageCount}-stage production sequence`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {data.snapshot.manufacturing.stages.map((s, i) => (
                  <span key={s.name} className="flex items-center gap-1.5">
                    <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-mono text-slate-600">
                      {s.order}. {s.name}
                    </span>
                    {i < data.snapshot.manufacturing.stages.length - 1 && (
                      <span className="text-slate-300">→</span>
                    )}
                  </span>
                ))}
              </div>
            </SectionCard>

            {/* ─── Grading + Charging ───────────────────────────────────── */}
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard
                icon={<Layers className="h-4 w-4" />}
                title="Battery Grading Configuration"
                subtitle="Live grade thresholds (DB singleton)"
              >
                {data.snapshot.grading ? (
                  <dl className="grid grid-cols-2 gap-y-2 text-xs">
                    <DefRow label="Grade A (cap ≥ / IR ≤)">
                      {data.snapshot.grading.gradeAMinCapacityPct}% / {data.snapshot.grading.gradeAMaxIrMult}×
                    </DefRow>
                    <DefRow label="Grade B (cap ≥ / IR ≤)">
                      {data.snapshot.grading.gradeBMinCapacityPct}% / {data.snapshot.grading.gradeBMaxIrMult}×
                    </DefRow>
                    <DefRow label="Grade C (cap ≥ / IR ≤)">
                      {data.snapshot.grading.gradeCMinCapacityPct}% / {data.snapshot.grading.gradeCMaxIrMult}×
                    </DefRow>
                    <DefRow label="Max capacity diff">{data.snapshot.grading.maxCapacityDiffAh} Ah</DefRow>
                    <DefRow label="Max IR diff">{data.snapshot.grading.maxIrDiffMohm} mΩ</DefRow>
                    <DefRow label="Max voltage diff">{data.snapshot.grading.maxVoltageDiffMv} mV</DefRow>
                    <DefRow label="Nominal IR">{data.snapshot.grading.nominalIrMohm} mΩ</DefRow>
                  </dl>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-red-600">
                    <XCircle className="h-4 w-4" /> Grade config row missing.
                  </div>
                )}
              </SectionCard>

              <SectionCard
                icon={<BatteryCharging className="h-4 w-4" />}
                title="Charging Configuration"
                subtitle="Cell-balancing voltage-spread thresholds"
              >
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <DefRow label="Pass (≤)">{data.snapshot.manufacturing.balancing.passMaxMv} mV</DefRow>
                  <DefRow label="Warning (≤)">{data.snapshot.manufacturing.balancing.warningMaxMv} mV</DefRow>
                  <dt className="text-slate-500">Fail (&gt;)</dt>
                  <dd className="font-mono text-slate-700">{data.snapshot.manufacturing.balancing.warningMaxMv} mV</dd>
                </dl>
              </SectionCard>
            </div>

            {/* ─── Version ──────────────────────────────────────────────── */}
            <SectionCard icon={<Tag className="h-4 w-4" />} title="Version Information" subtitle="Build & runtime versions">
              <dl className="grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-3">
                <DefRow label="API server">{data.snapshot.version.apiServer}</DefRow>
                <DefRow label="Node.js">{data.snapshot.version.node}</DefRow>
                <DefRow label="NODE_ENV">{data.snapshot.version.nodeEnv}</DefRow>
              </dl>
            </SectionCard>
          </>
        )}
      </div>
    </OdsPageLayout>
  );
}
