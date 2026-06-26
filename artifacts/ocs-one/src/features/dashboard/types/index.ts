// Types scoped to the Dashboard feature.

export interface DashboardModuleCard {
  title: string;
  href: string;
  stats: { label: string; value: string | number }[];
}

export interface ActivityItem {
  id: string;
  text: string;
  time: string;
}

export interface QuickStat {
  label: string;
  value: string | number;
}
