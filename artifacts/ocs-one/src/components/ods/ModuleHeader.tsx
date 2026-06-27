/**
 * ODS Standard 13 — Module Header
 * ODS Standard 14 — Certification Badge
 *
 * Every module uses this exact header. No ad-hoc h1+p combos.
 */

import { OdsCertBadge, type CertLevel } from "./OdsCertBadge";

interface ModuleHeaderProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  certification?: CertLevel;
  /** Optional meta chips: e.g. [{ label: "Version", value: "1.0" }] */
  meta?: { label: string; value: string }[];
  /** Buttons / actions rendered on the right side */
  actions?: React.ReactNode;
}

export function ModuleHeader({
  icon,
  title,
  description,
  certification = "development",
  meta,
  actions,
}: ModuleHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between pb-4 border-b mb-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <OdsCertBadge level={certification} />
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
          {meta && meta.length > 0 && (
            <div className="flex gap-3 mt-1.5 flex-wrap">
              {meta.map((m) => (
                <span key={m.label} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.label}:</span>{" "}
                  {m.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
