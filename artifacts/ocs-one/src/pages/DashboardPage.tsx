import { Factory, Package, ShieldCheck, Truck, Wrench, ChevronRight } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { ModuleCard, StatTile, ActivityFeed } from "@/features/dashboard";
import { motion } from "framer-motion";

const STAGGER = 0.1;

export default function DashboardPage() {
  const modules = [
    {
      title: "Production",
      icon: Factory,
      href: "#",
      stats: [
        { label: "Batches Active", value: "12" },
        { label: "Units Completed Today", value: "840" },
      ],
    },
    {
      title: "Inventory",
      icon: Package,
      href: "#",
      stats: [
        { label: "Total SKUs", value: "1,240" },
        { label: "Low Stock Alerts", value: "7" },
      ],
    },
    {
      title: "QC",
      icon: ShieldCheck,
      href: "#",
      stats: [
        { label: "Pass Rate", value: "98.2%" },
        { label: "Pending Inspections", value: "15" },
      ],
    },
    {
      title: "Dispatch",
      icon: Truck,
      href: "#",
      stats: [
        { label: "Shipments Today", value: "24" },
        { label: "Pending Orders", value: "6" },
      ],
    },
    {
      title: "Service",
      icon: Wrench,
      href: "#",
      stats: [
        { label: "Open Tickets", value: "43" },
        { label: "Avg. Resolution", value: "2.3 days" },
      ],
    },
  ];

  const quickStats = [
    { label: "Total Units Produced", value: "124,592" },
    { label: "Revenue MTD", value: "₹42.8M" },
    { label: "Active Work Orders", value: "56" },
    { label: "Staff On-Floor", value: "241" },
  ];

  const activities = [
    { id: "1", text: "Batch #B-2041 completed QC", time: "10 mins ago" },
    { id: "2", text: "Dispatch #D-871 shipped to Delhi", time: "45 mins ago" },
    { id: "3", text: "New work order #WO-192 created", time: "2 hours ago" },
    { id: "4", text: "Inventory alert: Cell Grade B (Low Stock)", time: "3 hours ago" },
    { id: "5", text: "Maintenance completed on Line 4", time: "5 hours ago" },
  ];

  return (
    <AppLayout>
      <div className="mb-8">
        <div className="flex items-center text-sm text-muted-foreground mb-2">
          <span>Home</span>
          <ChevronRight size={14} className="mx-1" />
          <span className="text-foreground font-medium">Dashboard</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
        {modules.map((mod, i) => (
          <motion.div
            key={mod.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * STAGGER }}
          >
            <ModuleCard {...mod} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: modules.length * STAGGER }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            {quickStats.map((stat, i) => (
              <StatTile key={i} {...stat} />
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (modules.length + 1) * STAGGER }}
            className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <h4 className="font-semibold text-primary">More modules coming soon</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Manufacturing, Reports, and AI Assistant are under active development.
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: (modules.length + 2) * STAGGER }}
          className="h-full"
        >
          <ActivityFeed activities={activities} />
        </motion.div>
      </div>
    </AppLayout>
  );
}
