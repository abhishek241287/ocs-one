import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ExternalLink, Loader2, ScanLine } from "lucide-react";
import { Link } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ObjectPageTab = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export function PageShell({
  backHref,
  backLabel,
  eyebrow,
  title,
  children,
}: {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </span>
        </div>
        {children}
      </div>
    </AppLayout>
  );
}

export function IdentityHeader({
  kind,
  title,
  subtitle,
  status,
  statusClassName,
  metadata,
  traceHref,
  actions,
  icon: Icon,
}: {
  kind: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusClassName?: string;
  metadata: Array<{ label: string; value: ReactNode }>;
  traceHref: string;
  actions?: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-5">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              {kind}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-tight text-foreground">{title}</h1>
                {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {status && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", statusClassName)}>
                  {status.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={traceHref}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ScanLine className="h-4 w-4" />
                TRACE
              </Button>
            </Link>
            {actions}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          {metadata.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{item.value ?? "—"}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TabStrip({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: ObjectPageTab[];
  activeTab: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Object page sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function ObjectFieldGrid({
  fields,
  columns = 3,
}: {
  fields: Array<{ label: string; value: ReactNode }>;
  columns?: 2 | 3 | 4;
}) {
  const gridClass = columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-1 gap-x-5 gap-y-4", gridClass)}>
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
          <p className="mt-1 break-words text-sm font-semibold text-foreground">{field.value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

export function ObjectPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function ObjectLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function FeedEmpty({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{message}</div>;
}

export function CitationBadge({
  citation,
}: {
  citation: { type: string; id: string };
}) {
  return (
    <span
      title={`${citation.type} ${citation.id}`}
      className="inline-flex max-w-full items-center gap-1 rounded border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      {citation.type} · {citation.id}
    </span>
  );
}