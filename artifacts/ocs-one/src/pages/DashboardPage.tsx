import { Factory, Package, ShieldCheck, Truck, Wrench, ChevronRight, Battery, Cpu, Gauge, Code2, Clock, Loader2 } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { ModuleCard, StatTile, ActivityFeed } from "@/features/dashboard";
import { motion } from "framer-motion";
import { useGetManufacturingDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";

const STAGGER = 0.1;

function MfgKpiCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string | number | null | undefined;
  icon: React.FC<{ className?: string }>;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-xl border-2 ${color} p-4 flex items-center gap-3`}>
      <div className="shrink-0">
        <Icon className="h-8 w-8 opacity-70" />
      </div>
      <div>
        <p className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</p>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin mt-1 opacity-50" />
        ) : (
          <p className="text-2xl font-bold">{value ?? "—"}</p>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: mfgDash, isLoading: mfgLoading } = useGetManufacturingDashboard();

  const modules = [
    {
      title: "Production",
      icon: Factory,
      href: "/manufacturing",
      stats: [
        { label: "Orders In Progress", value: mfgLoading ? "…" : String(mfgDash?.ordersInProgress ?? 0) },
        { label: "Completed", value: mfgLoading ? "…" : String(mfgDash?.ordersCompleted ?? 0) },
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
    { label: "Total Production Orders", value: mfgLoading ? "…" : String(mfgDash?.totalOrders ?? 0) },
    { label: "Cells Allocated", value: mfgLoading ? "…" : String(mfgDash?.cellsAllocatedTotal ?? 0) },
    { label: "Active Work Orders", value: mfgLoading ? "…" : String(mfgDash?.ordersInProgress ?? 0) },
    { label: "Avg Assembly Time", value: mfgLoading ? "…" : mfgDash?.avgAssemblyTimeHrs != null ? `${mfgDash.avgAssemblyTimeHrs}h` : "N/A" },
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
          {/* Quick stats */}
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

          {/* Live Manufacturing Pipeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (modules.length + 1) * STAGGER }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Factory className="h-4 w-4 text-orange-600" />
                Live Manufacturing Pipeline
              </h3>
              <Link href="/manufacturing/orders" className="text-xs text-orange-600 hover:underline font-medium">
                View all orders →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MfgKpiCard
                label="Under Assembly"
                value={mfgDash?.batteriesUnderAssembly}
                icon={Wrench}
                color="border-blue-200 bg-blue-50 text-blue-900"
                loading={mfgLoading}
              />
              <MfgKpiCard
                label="Compression"
                value={mfgDash?.compressionPending}
                icon={Gauge}
                color="border-purple-200 bg-purple-50 text-purple-900"
                loading={mfgLoading}
              />
              <MfgKpiCard
                label="BMS Pending"
                value={mfgDash?.bmsPending}
                icon={Cpu}
                color="border-teal-200 bg-teal-50 text-teal-900"
                loading={mfgLoading}
              />
              <MfgKpiCard
                label="Programming"
                value={mfgDash?.programmingPending}
                icon={Code2}
                color="border-orange-200 bg-orange-50 text-orange-900"
                loading={mfgLoading}
              />
            </div>
          </motion.div>

          {/* Order status breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (modules.length + 2) * STAGGER }}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          >
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Order Status Breakdown</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-500">{mfgLoading ? "…" : mfgDash?.ordersDraft ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Draft</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{mfgLoading ? "…" : mfgDash?.ordersInProgress ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">In Progress</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{mfgLoading ? "…" : mfgDash?.ordersCompleted ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Completed</p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: (modules.length + 3) * STAGGER }}
          className="h-full"
        >
          <ActivityFeed activities={activities} />
        </motion.div>
      </div>
    </AppLayout>
  );
}
