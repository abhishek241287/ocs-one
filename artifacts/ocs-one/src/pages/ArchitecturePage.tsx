import { useState } from "react";
import { Link } from "wouter";
import { ArrowDown, ExternalLink, Layers, GitBranch, Database, Cpu, Palette, FlaskConical } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { ModuleHeader } from "@/components/ods";
import MODULES, {
  MODULE_MAP, PIPELINE_ORDER, LAYER_META, CERT_META, METHOD_META,
  type ModuleNode,
} from "@/data/architecture";

// ─── Sub-components ─────────────────────────────────────────────────────────

function Chip({
  label,
  onClick,
  clickable = false,
  mono = false,
}: {
  label: string;
  onClick?: () => void;
  clickable?: boolean;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        "inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs transition-colors",
        mono ? "font-mono" : "font-medium",
        clickable
          ? "bg-white border-slate-200 text-slate-700 hover:bg-primary/5 hover:border-primary/30 cursor-pointer"
          : "bg-slate-50 border-slate-200 text-slate-600 cursor-default",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
      {icon}
      {label}
    </div>
  );
}

function EmptyChips({ label }: { label: string }) {
  return <p className="text-xs text-slate-400 italic">{label}</p>;
}

function PipelineNode({
  mod,
  selected,
  onClick,
}: {
  mod: ModuleNode;
  selected: boolean;
  onClick: () => void;
}) {
  const cert = CERT_META[mod.certStatus];
  const layer = LAYER_META[mod.layer];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2.5 rounded-lg border transition-all",
        selected
          ? "bg-primary/5 border-primary/40 ring-1 ring-primary/30 shadow-sm"
          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base shrink-0">{mod.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className={`text-xs font-semibold truncate ${selected ? "text-primary" : "text-slate-800"}`}>
              {mod.name}
            </span>
            <span className={`shrink-0 w-2 h-2 rounded-full ${cert.dot}`} title={cert.label} />
          </div>
          <div className={`text-[10px] font-medium mt-0.5 ${layer.color}`}>
            {layer.label}
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailPanel({ mod, onNavigate }: { mod: ModuleNode; onNavigate: (id: string) => void }) {
  const cert = CERT_META[mod.certStatus];
  const layer = LAYER_META[mod.layer];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start gap-3">
          <span className="text-3xl">{mod.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{mod.name}</h2>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cert.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cert.dot}`} />
                {cert.label}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${layer.bg} ${layer.color}`}>
                {layer.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">{mod.description}</p>
          </div>
        </div>

        {/* Metadata row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Version", value: mod.version },
            { label: "Test Coverage", value: mod.testCoverage },
            { label: "Cert Status", value: cert.label },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Open page link */}
        {mod.path && (
          <div className="mt-3">
            <Link href={mod.path}>
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium cursor-pointer">
                <ExternalLink className="h-3 w-3" /> Open module →
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* Depends On / Used By */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SectionHeading icon={<GitBranch className="h-3.5 w-3.5" />} label="Depends On" />
          <div className="flex flex-wrap gap-1.5">
            {mod.dependsOn.length === 0 ? (
              <EmptyChips label="No dependencies" />
            ) : (
              mod.dependsOn.map((id) => {
                const m = MODULE_MAP[id];
                return m ? (
                  <Chip
                    key={id}
                    label={`${m.icon} ${m.name}`}
                    clickable
                    onClick={() => onNavigate(id)}
                  />
                ) : null;
              })
            )}
          </div>
        </div>
        <div>
          <SectionHeading icon={<Layers className="h-3.5 w-3.5" />} label="Used By" />
          <div className="flex flex-wrap gap-1.5">
            {mod.usedBy.length === 0 ? (
              <EmptyChips label="Top of stack — no dependants" />
            ) : (
              mod.usedBy.map((id) => {
                const m = MODULE_MAP[id];
                return m ? (
                  <Chip
                    key={id}
                    label={`${m.icon} ${m.name}`}
                    clickable
                    onClick={() => onNavigate(id)}
                  />
                ) : null;
              })
            )}
          </div>
        </div>
      </div>

      {/* APIs */}
      <div>
        <SectionHeading icon={<Cpu className="h-3.5 w-3.5" />} label={`APIs (${mod.apis.length})`} />
        {mod.apis.length === 0 ? (
          <EmptyChips label="No API endpoints (client-side only)" />
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {mod.apis.map((api, i) => {
              const m = METHOD_META[api.method];
              return (
                <div key={i} className="flex items-start gap-3 px-3 py-2 bg-white hover:bg-slate-50 transition-colors">
                  <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${m.bg} ${m.color}`}>
                    {api.method}
                  </span>
                  <div className="min-w-0">
                    <code className="text-xs font-mono text-slate-800 break-all">{api.path}</code>
                    <p className="text-[11px] text-slate-500 mt-0.5">{api.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DB Tables */}
      <div>
        <SectionHeading icon={<Database className="h-3.5 w-3.5" />} label={`Database Tables (${mod.dbTables.length})`} />
        <div className="flex flex-wrap gap-1.5">
          {mod.dbTables.length === 0 ? (
            <EmptyChips label="No direct DB tables" />
          ) : (
            mod.dbTables.map((t) => <Chip key={t} label={t} mono />)
          )}
        </div>
      </div>

      {/* Components */}
      <div>
        <SectionHeading icon={<Cpu className="h-3.5 w-3.5" />} label={`Components (${mod.components.length})`} />
        <div className="flex flex-wrap gap-1.5">
          {mod.components.length === 0 ? (
            <EmptyChips label="No React components defined" />
          ) : (
            mod.components.map((c) => <Chip key={c} label={c} mono />)
          )}
        </div>
      </div>

      {/* ODS Components */}
      <div>
        <SectionHeading icon={<Palette className="h-3.5 w-3.5" />} label={`ODS Components Used (${mod.odsComponents.length})`} />
        <div className="flex flex-wrap gap-1.5">
          {mod.odsComponents.length === 0 ? (
            <EmptyChips label={mod.id === "ods" ? "This IS the design system" : "None"} />
          ) : (
            mod.odsComponents.map((c) => <Chip key={c} label={c} mono />)
          )}
        </div>
      </div>

      {/* Test Coverage note */}
      <div>
        <SectionHeading icon={<FlaskConical className="h-3.5 w-3.5" />} label="Test Coverage" />
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {mod.testCoverage}
        </p>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-12 select-none">
      <div className="text-5xl mb-4">🗺️</div>
      <div className="text-lg font-semibold text-slate-700">Select a module</div>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">
        Click any node in the pipeline to see its dependencies, APIs, database tables, and component inventory.
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? MODULE_MAP[selectedId] : null;

  const certCounts = {
    certified: MODULES.filter((m) => m.certStatus === "certified").length,
    underValidation: MODULES.filter((m) => m.certStatus === "under-validation").length,
    development: MODULES.filter((m) => m.certStatus === "development").length,
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full p-6 gap-5 min-h-screen">
        <ModuleHeader
          icon="🗺️"
          title="Architecture Map"
          description={`${MODULES.length} modules · ${certCounts.certified} certified · ${certCounts.underValidation} under validation`}
          certification="certified"
        />

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {Object.entries(CERT_META).map(([status, meta]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            {Object.entries(LAYER_META).map(([layer, meta]) => (
              <span key={layer} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color}`}>
                {meta.label}
              </span>
            ))}
          </div>
        </div>

        {/* Main layout */}
        <div className="flex gap-5 flex-1 min-h-0">
          {/* Pipeline sidebar */}
          <div className="w-52 shrink-0 flex flex-col gap-0 overflow-y-auto">
            {PIPELINE_ORDER.map((id, idx) => {
              const mod = MODULE_MAP[id];
              if (!mod) return null;
              return (
                <div key={id} className="flex flex-col items-center">
                  <div className="w-full">
                    <PipelineNode
                      mod={mod}
                      selected={selectedId === id}
                      onClick={() => setSelectedId(id)}
                    />
                  </div>
                  {idx < PIPELINE_ORDER.length - 1 && (
                    <div className="flex flex-col items-center py-0.5 text-slate-300">
                      <ArrowDown className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white overflow-y-auto">
            <div className="p-6">
              {selected ? (
                <DetailPanel mod={selected} onNavigate={(id) => setSelectedId(id)} />
              ) : (
                <EmptyDetail />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
