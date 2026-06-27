import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/use-auth";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const register = useRegister();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);

    if (password.length < 8) {
      setClientError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setClientError("Passwords do not match");
      return;
    }

    try {
      await register.mutateAsync({ name, email, password });
      setLocation("/dashboard");
    } catch {
      // error displayed via register.error
    }
  };

  const errorMsg = clientError ?? register.error?.message;

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col w-1/2 bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-primary text-primary-foreground p-2 rounded-md">
            <Zap size={28} />
          </div>
          <span className="font-bold text-2xl tracking-tight">OCS One</span>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-tight">
            Powering India's Clean Energy Future
          </h1>
          <p className="text-lg text-sidebar-foreground/70 mb-12">
            The enterprise operating system for LiFePO4 batteries, hybrid solar inverters, and EV chargers manufacturing.
          </p>
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-5 text-sm text-sidebar-foreground/80 space-y-2">
            <p className="font-semibold text-sidebar-foreground">New accounts start as Viewer</p>
            <p>A director can grant you additional permissions after your account is created.</p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="bg-primary text-primary-foreground p-2 rounded-md">
              <Zap size={24} />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">OCS One</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Create account</h2>
            <p className="text-muted-foreground">
              Already have one?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                required
                className="h-11"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={register.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                required
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={register.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  required
                  className="h-11 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={register.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat your password"
                required
                className="h-11"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={register.isPending}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-medium"
              disabled={register.isPending}
            >
              {register.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </div>

        <div className="absolute bottom-8 left-0 right-0 text-center text-sm text-muted-foreground">
          OCS One v1.0 · © 2026 OCS Oorja Green Pvt. Ltd.
        </div>
      </div>
    </div>
  );
}
