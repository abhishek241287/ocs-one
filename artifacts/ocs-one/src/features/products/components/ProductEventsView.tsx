import { useGetProductEvents } from "@workspace/api-client-react";
import { Loader2, Clock, Activity } from "lucide-react";

interface Props {
  productId: string;
}

// Visual accent per known event type; unknown types fall back to neutral.
const EVENT_DOT: Record<string, string> = {
  "product.created": "bg-green-500",
  "product.status_changed": "bg-blue-500",
};

export default function ProductEventsView({ productId }: Props) {
  const { data, isLoading } = useGetProductEvents(productId);
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
      <div className="text-center py-12 text-gray-400 border rounded-lg space-y-2">
        <Clock className="h-10 w-10 mx-auto text-gray-300" />
        <p className="text-sm font-medium">No events recorded</p>
        <p className="text-xs">
          Lifecycle events are appended as the product moves through its stages
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-orange-600" />
        <h3 className="font-semibold text-gray-900">Lifecycle Timeline</h3>
        <span className="ml-auto text-sm text-gray-500">{events.length} events</span>
      </div>
      <ol className="relative border-l border-gray-200 ml-3 space-y-6">
        {events.map((e) => (
          <li key={e.id} className="ml-6">
            <span
              className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                EVENT_DOT[e.event_type] ?? "bg-gray-400"
              }`}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{e.description}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600">
                {e.event_type}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(e.created_at).toLocaleString()} · {e.actor}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
