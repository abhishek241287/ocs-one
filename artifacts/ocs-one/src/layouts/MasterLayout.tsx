/**
 * ODS Standard Layout — Master Page
 *
 * Pattern: ModuleHeader → OdsToolbar → OdsDataTable → OdsDrawer + OdsDialog
 *
 * Usage:
 *   <MasterLayout
 *     header={<ModuleHeader ... />}
 *     toolbar={<OdsToolbar ... />}
 *     drawers={<> <OdsDrawer .../> <OdsDialog .../> </>}
 *   >
 *     <OdsDataTable ... />
 *   </MasterLayout>
 */
import AppLayout from "./AppLayout";

interface MasterLayoutProps {
  /** ModuleHeader component */
  header: React.ReactNode;
  /** OdsToolbar or equivalent — search, filters, refresh, actions */
  toolbar?: React.ReactNode;
  /** Table content — OdsDataTable recommended */
  children: React.ReactNode;
  /** OdsDrawer + OdsDialog components */
  drawers?: React.ReactNode;
}

export function MasterLayout({ header, toolbar, children, drawers }: MasterLayoutProps) {
  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {header}
        {toolbar && <div>{toolbar}</div>}
        {children}
        {drawers}
      </div>
    </AppLayout>
  );
}
