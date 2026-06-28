import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OdsCommandPalette, DevModeProvider } from "@/components/ods";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import DesignSystemPage from "@/pages/DesignSystemPage";
import ExecutiveDashboardPage from "@/features/reports/pages/ExecutiveDashboardPage";
import ProductionReportPage from "@/features/reports/pages/ProductionReportPage";
import CellAnalyticsPage from "@/features/reports/pages/CellAnalyticsPage";
import QualityAnalyticsPage from "@/features/reports/pages/QualityAnalyticsPage";
import InventoryAnalyticsPage from "@/features/reports/pages/InventoryAnalyticsPage";
import LogisticsAnalyticsPage from "@/features/reports/pages/LogisticsAnalyticsPage";
import ExportCenterPage from "@/features/reports/pages/ExportCenterPage";
import DirectorDashboardPage from "@/pages/DirectorDashboardPage";
import ProductMasterPage from "@/features/masters/pages/ProductMasterPage";
import ProductCategoryPage from "@/features/masters/pages/ProductCategoryPage";
import ProductWorkflowPage from "@/features/masters/pages/ProductWorkflowPage";
import MaterialMasterPage from "@/features/masters/pages/MaterialMasterPage";
import MaterialCategoryPage from "@/features/masters/pages/MaterialCategoryPage";
import ProductsListPage from "@/features/products/pages/ProductsListPage";
import ProductDetailPage from "@/features/products/pages/ProductDetailPage";
import CellMasterPage from "@/features/masters/pages/CellMasterPage";
import BmsMasterPage from "@/features/masters/pages/BmsMasterPage";
import CabinetMasterPage from "@/features/masters/pages/CabinetMasterPage";
import ConnectorMasterPage from "@/features/masters/pages/ConnectorMasterPage";
import CableMasterPage from "@/features/masters/pages/CableMasterPage";
import BusbarMasterPage from "@/features/masters/pages/BusbarMasterPage";
import ChargerMasterPage from "@/features/masters/pages/ChargerMasterPage";
import TestEquipmentMasterPage from "@/features/masters/pages/TestEquipmentMasterPage";
import OrdersListPage from "@/features/manufacturing/pages/OrdersListPage";
import OrderDetailPage from "@/features/manufacturing/pages/OrderDetailPage";
import ChargerManagementPage from "@/features/manufacturing/pages/ChargerManagementPage";
import ChargingDashboardPage from "@/features/manufacturing/pages/ChargingDashboardPage";
import TestingDashboardPage from "@/features/manufacturing/pages/TestingDashboardPage";
import ReworkQueuePage from "@/features/manufacturing/pages/ReworkQueuePage";
import CellReceivingPage from "@/features/cells/pages/CellReceivingPage";
import CellGradingPage from "@/features/cells/pages/CellGradingPage";
import CellInventoryPage from "@/features/cells/pages/CellInventoryPage";
import CellMatchingPage from "@/features/cells/pages/CellMatchingPage";
import GradeConfigPage from "@/features/cells/pages/GradeConfigPage";
import PackingDashboardPage from "@/features/logistics/pages/PackingDashboardPage";
import DealerMasterPage from "@/features/logistics/pages/DealerMasterPage";
import DispatchOrdersPage from "@/features/logistics/pages/DispatchOrdersPage";
import DispatchOrderDetailPage from "@/features/logistics/pages/DispatchOrderDetailPage";
import ArchitecturePage from "@/pages/ArchitecturePage";
import PerformancePage from "@/pages/PerformancePage";
import SecurityPage from "@/pages/SecurityPage";
import ConfigurationPage from "@/pages/ConfigurationPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={DirectorDashboardPage} />
      <Route path="/design-system" component={DesignSystemPage} />
      <Route path="/developer/architecture" component={ArchitecturePage} />
      <Route path="/developer/performance" component={PerformancePage} />
      <Route path="/developer/security" component={SecurityPage} />
      <Route path="/developer/configuration" component={ConfigurationPage} />

      {/* Products */}
      <Route path="/products" component={ProductsListPage} />
      <Route path="/products/:id" component={ProductDetailPage} />

      {/* Masters */}
      <Route path="/masters/products" component={ProductMasterPage} />
      <Route path="/masters/product-categories" component={ProductCategoryPage} />
      <Route path="/masters/product-workflows" component={ProductWorkflowPage} />
      <Route path="/masters/material-categories" component={MaterialCategoryPage} />
      <Route path="/masters/materials" component={MaterialMasterPage} />
      <Route path="/masters/cells" component={CellMasterPage} />
      <Route path="/masters/bms" component={BmsMasterPage} />
      <Route path="/masters/cabinets" component={CabinetMasterPage} />
      <Route path="/masters/connectors" component={ConnectorMasterPage} />
      <Route path="/masters/cables" component={CableMasterPage} />
      <Route path="/masters/busbars" component={BusbarMasterPage} />
      <Route path="/masters/chargers" component={ChargerMasterPage} />
      <Route path="/masters/test-equipment" component={TestEquipmentMasterPage} />

      {/* Manufacturing */}
      <Route path="/manufacturing">
        <Redirect to="/manufacturing/orders" />
      </Route>
      <Route path="/manufacturing/orders" component={OrdersListPage} />
      <Route path="/manufacturing/orders/:id" component={OrderDetailPage} />
      <Route path="/manufacturing/chargers" component={ChargerManagementPage} />
      <Route path="/manufacturing/charging-dashboard" component={ChargingDashboardPage} />
      <Route path="/manufacturing/testing-dashboard" component={TestingDashboardPage} />
      <Route path="/manufacturing/rework" component={ReworkQueuePage} />

      {/* Cells */}
      <Route path="/cells/receiving" component={CellReceivingPage} />
      <Route path="/cells/grading" component={CellGradingPage} />
      <Route path="/cells/inventory" component={CellInventoryPage} />
      <Route path="/cells/matching" component={CellMatchingPage} />
      <Route path="/cells/config" component={GradeConfigPage} />

      {/* Logistics */}
      <Route path="/logistics">
        <Redirect to="/logistics/packing-dashboard" />
      </Route>
      <Route path="/logistics/packing-dashboard" component={PackingDashboardPage} />
      <Route path="/logistics/dealers" component={DealerMasterPage} />
      <Route path="/logistics/dispatch-orders" component={DispatchOrdersPage} />
      <Route path="/logistics/dispatch-orders/:id" component={DispatchOrderDetailPage} />

      {/* Reports */}
      <Route path="/reports/executive" component={ExecutiveDashboardPage} />
      <Route path="/reports/production" component={ProductionReportPage} />
      <Route path="/reports/cells" component={CellAnalyticsPage} />
      <Route path="/reports/quality" component={QualityAnalyticsPage} />
      <Route path="/reports/inventory" component={InventoryAnalyticsPage} />
      <Route path="/reports/logistics" component={LogisticsAnalyticsPage} />
      <Route path="/reports/export" component={ExportCenterPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <DevModeProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
              {/* Global overlays — available on every page */}
              <OdsCommandPalette />
            </WouterRouter>
          </DevModeProvider>
        </ErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
