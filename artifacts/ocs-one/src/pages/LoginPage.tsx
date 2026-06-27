import { useState, useRef } from "react";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import { useLocation, Link } from "wouter";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const login = useLogin();
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit(), autoFocusDelay: 0 });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      setLocation("/dashboard");
    } catch {
      // error displayed via login.error
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex flex-col w-1/2 bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
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
          <div className="grid grid-cols-2 gap-8 border-t border-sidebar-border pt-8">
            <div>
              <div className="text-3xl font-bold text-primary mb-1">12+</div>
              <div className="text-sm text-sidebar-foreground/60 uppercase tracking-wider font-medium">Facilities</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-1">2.4M</div>
              <div className="text-sm text-sidebar-foreground/60 uppercase tracking-wider font-medium">Units Shipped</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="bg-primary text-primary-foreground p-2 rounded-md">
              <Zap size={24} />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">OCS One</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Welcome back</h2>
            <p className="text-muted-foreground">
              Sign in to OCS One · {" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                Create account
              </Link>
            </p>
          </div>

          {login.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {login.error.message}
            </div>
          )}

          <form ref={formRef} onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                required
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={login.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  className="h-11 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={login.isPending}
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
            <Button type="submit" className="w-full h-11 text-base font-medium" disabled={login.isPending}>
              {login.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
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
