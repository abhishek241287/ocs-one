/**
 * ODS Standard Page Shell
 *
 * Canonical page structure for OCS One:
 *   ModuleHeader → Toolbar (optional) → Content → Footer (optional)
 *
 * All new pages should use this component. Existing MasterLayout,
 * DashboardLayout, WorkflowLayout, and ReportLayout are thin aliases
 * kept for backwards compatibility.
 *
 * Usage:
 *   <OdsPageLayout
 *     header={<ModuleHeader ... />}
 *     toolbar={<OdsToolbar ... />}
 *     footer={<div>...</div>}
 *   >
 *     <OdsDataTable ... />
 *   </OdsPageLayout>
 */
import AppLayout from "@/layouts/AppLayout";
import { cn } from "@/lib/utils";

export interface OdsPageLayoutProps {
  /** ModuleHeader (required) */
  header: React.ReactNode;
  /** OdsToolbar or any filter/action bar — rendered directly below header */
  toolbar?: React.ReactNode;
  /** Optional sticky footer rendered at the bottom of the page */
  footer?: React.ReactNode;
  /** Remove the default p-6 padding (for full-bleed content) */
  noPadding?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function OdsPageLayout({
  header,
  toolbar,
  footer,
  noPadding = false,
  children,
  className,
}: OdsPageLayoutProps) {
  return (
    <AppLayout>
      <div
        className={cn(
          "flex flex-col min-h-screen",
          !noPadding && "p-6",
          "space-y-5",
          className,
        )}
      >
        {header}
        {toolbar && <div>{toolbar}</div>}
        <div className="flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="pt-4 border-t border-slate-100 mt-auto">{footer}</div>
        )}
      </div>
    </AppLayout>
  );
}
