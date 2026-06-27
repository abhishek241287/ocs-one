/**
 * ODS Standard 8 — Empty States.
 * Never a blank page. Always icon + message + action.
 */

import { Button } from "@/components/ui/button";

interface OdsEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function OdsEmptyState({ icon = "📄", title, description, action }: OdsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3 select-none">{icon}</div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
