import { useGetOrderTimeline } from "@workspace/api-client-react";
import { Loader2, Clock, CheckCircle2, PlayCircle, XCircle, Plus, Package2 } from "lucide-react";

const EVENT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  order_created: Package2,
  stage_started: PlayCircle,
  stage_completed: CheckCircle2,
  stage_approved: CheckCircle2,
  stage_rejected: XCircle,
};

const EVENT_COLORS: Record<string, string> = {
  order_created: "bg-orange-100 text-orange-600",
  stage_started: "bg-blue-100 text-blue-600",
  stage_completed: "bg-yellow-100 text-yellow-700",
  stage_approved: "bg-green-100 text-green-600",
  stage_rejected: "bg-red-100 text-red-600",
};

interface Props {
  orderId: string;
}

export default function TimelineView({ orderId }: Props) {
  const { data, isLoading } = useGetOrderTimeline(orderId);
  const events = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No timeline events yet
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
      <ul className="space-y-4">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.eventType] ?? Clock;
          const colorClass = EVENT_COLORS[event.eventType] ?? "bg-gray-100 text-gray-500";
          return (
            <li key={event.id} className="flex gap-4 relative">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center z-10 ${colorClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <p className="text-sm font-medium text-gray-900">{event.description}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">{event.actor}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
