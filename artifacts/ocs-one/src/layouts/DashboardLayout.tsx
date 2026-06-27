/**
 * ODS Standard Layout — Dashboard Page
 *
 * Pattern: ModuleHeader → KPI cards row → optional charts → data tables / feeds
 *
 * Usage:
 *   <DashboardLayout
 *     header={<ModuleHeader ... />}
 *     kpis={<div className="grid grid-cols-4 gap-4">...</div>}
 *     charts={<div className="grid grid-cols-2 gap-4">...</div>}
 *   >
 *     {table or feed content}
 *   </DashboardLayout>
 */
import AppLayout from "./AppLayout";

interface DashboardLayoutProps {
  /** ModuleHeader component */
  header: React.ReactNode;
  /** KPI metric card row */
  kpis?: React.ReactNode;
  /** Chart / visualisation row — rendered below KPIs */
  charts?: React.ReactNode;
  /** Main body — tables, feeds, lists */
  children: React.ReactNode;
}

export function DashboardLayout({ header, kpis, charts, children }: DashboardLayoutProps) {
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {header}
        {kpis && <div>{kpis}</div>}
        {charts && <div>{charts}</div>}
        <div>{children}</div>
      </div>
    </AppLayout>
  );
}
