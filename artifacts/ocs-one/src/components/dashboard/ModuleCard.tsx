import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface ModuleCardProps {
  title: string;
  icon: LucideIcon;
  stats: { label: string; value: string | number }[];
  href: string;
}

export function ModuleCard({ title, icon: Icon, stats, href }: ModuleCardProps) {
  return (
    <Card className="hover:shadow-md transition-all duration-200 border-border group overflow-hidden bg-card">
      <CardContent className="p-0">
        <div className="p-5 flex flex-col h-full relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-md text-primary">
              <Icon size={24} />
            </div>
            <h3 className="font-semibold text-lg tracking-tight">{title}</h3>
          </div>
          
          <div className="space-y-4 flex-1">
            {stats.map((stat, idx) => (
              <div key={idx} className="flex justify-between items-end">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <span className="font-medium">{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border flex justify-end">
            <Link href={href} className="text-sm text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              View details <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
