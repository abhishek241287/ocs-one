import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { useAuth } from "@/hooks/use-auth";

const SIDEBAR_COLLAPSED_KEY = "ocs.sidebar.collapsed";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  const setSidebarCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
    } catch {
      // Keep the shell usable when browser storage is unavailable.
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Dealer is an external portal principal — blocked from every factory route on the
  // backend (denyDealerFactoryAccess). Keep the portal route available, but do not
  // render factory pages that would only 403.
  if (user?.role === "dealer" && !location.startsWith("/fulfillment/dealers")) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">Dealer access</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your account does not have access to the factory operations console. The
          dealer portal is available from the dedicated portal route.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} setCollapsed={setSidebarCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavbar toggleSidebar={() => setSidebarCollapsed(!collapsed)} />
        <main className="flex-1 overflow-auto bg-muted/20">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
