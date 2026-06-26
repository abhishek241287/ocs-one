import { Menu, Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./UserMenu";
import { useTheme } from "@/hooks/use-theme";

interface TopNavbarProps {
  toggleSidebar: () => void;
}

export function TopNavbar({ toggleSidebar }: TopNavbarProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-muted-foreground hover:text-foreground">
          <Menu size={20} />
        </Button>
      </div>

      <div className="flex-1 flex justify-center">
        <span className="text-sm font-medium text-muted-foreground hidden sm:block">
          OCS Oorja Green Pvt. Ltd.
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </Button>

        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
          </span>
        </Button>

        <UserMenu />
      </div>
    </header>
  );
}
