/**
 * ODS Standard Layout — Workflow / Stage Page
 *
 * Pattern: ModuleHeader → Stage stepper → Current stage card → History / audit log
 *
 * Usage:
 *   <WorkflowLayout
 *     header={<ModuleHeader ... />}
 *     stepper={<OdsStepperBar ... />}
 *     currentStage={<StageCard ... />}
 *   >
 *     {history table or audit list}
 *   </WorkflowLayout>
 */
import AppLayout from "./AppLayout";

interface WorkflowLayoutProps {
  /** ModuleHeader component */
  header: React.ReactNode;
  /** Stage stepper / progress indicator */
  stepper?: React.ReactNode;
  /** Currently active stage card or action panel */
  currentStage?: React.ReactNode;
  /** History log, audit table, or secondary content */
  children?: React.ReactNode;
}

export function WorkflowLayout({ header, stepper, currentStage, children }: WorkflowLayoutProps) {
  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {header}
        {stepper && <div>{stepper}</div>}
        {currentStage && <div>{currentStage}</div>}
        {children && <div>{children}</div>}
      </div>
    </AppLayout>
  );
}
