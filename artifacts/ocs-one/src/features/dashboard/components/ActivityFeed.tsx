import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Activity {
  id: string;
  text: string;
  time: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="border-border bg-card shadow-sm h-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {activities.map((activity, i) => (
            <div key={activity.id} className="flex gap-4 relative">
              {i !== activities.length - 1 && (
                <div className="absolute left-[9px] top-6 bottom-[-24px] w-px bg-border"></div>
              )}
              <div className="mt-1 h-5 w-5 rounded-full border-2 border-primary bg-background z-10 shrink-0"></div>
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{activity.text}</span>
                <span className="text-xs text-muted-foreground mt-1">{activity.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
