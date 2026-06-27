/**
 * ODS Standard Layout — Report Page
 *
 * Pattern: ModuleHeader → filter bar → summary KPIs → data table or chart
 *
 * Usage:
 *   <ReportLayout
 *     header={<ModuleHeader ... />}
 *     filters={<OdsToolbar ... />}
 *     summary={<div className="grid grid-cols-4 gap-4">...</div>}
 *   >
 *     <OdsDataTable ... />
 *   </ReportLayout>
 */
import AppLayout from "./AppLayout";

interface ReportLayoutProps {
  /** ModuleHeader component */
  header: React.ReactNode;
  /** Filter bar — OdsToolbar or custom filter row */
  filters?: React.ReactNode;
  /** Summary KPI row rendered between filters and main content */
  summary?: React.ReactNode;
  /** Main report content — table, chart, or export area */
  children: React.ReactNode;
}

export function ReportLayout({ header, filters, summary, children }: ReportLayoutProps) {
  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {header}
        {filters && <div>{filters}</div>}
        {summary && <div>{summary}</div>}
        <div>{children}</div>
      </div>
    </AppLayout>
  );
}
