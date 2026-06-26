import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProductMasterPage from "@/features/masters/pages/ProductMasterPage";
import CellMasterPage from "@/features/masters/pages/CellMasterPage";
import BmsMasterPage from "@/features/masters/pages/BmsMasterPage";
import CabinetMasterPage from "@/features/masters/pages/CabinetMasterPage";
import ConnectorMasterPage from "@/features/masters/pages/ConnectorMasterPage";
import CableMasterPage from "@/features/masters/pages/CableMasterPage";
import BusbarMasterPage from "@/features/masters/pages/BusbarMasterPage";
import ChargerMasterPage from "@/features/masters/pages/ChargerMasterPage";
import TestEquipmentMasterPage from "@/features/masters/pages/TestEquipmentMasterPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/masters/products" component={ProductMasterPage} />
      <Route path="/masters/cells" component={CellMasterPage} />
      <Route path="/masters/bms" component={BmsMasterPage} />
      <Route path="/masters/cabinets" component={CabinetMasterPage} />
      <Route path="/masters/connectors" component={ConnectorMasterPage} />
      <Route path="/masters/cables" component={CableMasterPage} />
      <Route path="/masters/busbars" component={BusbarMasterPage} />
      <Route path="/masters/chargers" component={ChargerMasterPage} />
      <Route path="/masters/test-equipment" component={TestEquipmentMasterPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
