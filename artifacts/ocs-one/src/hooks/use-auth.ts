import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AUTH_KEY,
  DEALER_SESSION_CHANGED_MESSAGE,
  DEALER_SESSION_CHANGED_REASON,
  isDealerSessionExpiredError,
  recoverDealerSession,
} from "./dealer-session";

export {
  AUTH_KEY,
  DEALER_SESSION_CHANGED_MESSAGE,
  DEALER_SESSION_CHANGED_REASON,
  isDealerSessionExpiredError,
  recoverDealerSession,
} from "./dealer-session";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "director" | "supervisor" | "operator" | "viewer" | "dealer";
  dealerId?: string | null;
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch session");
  const { user } = await res.json() as { user: AuthUser };
  return user;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  };
}

export function useDealerSessionRecovery() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useCallback(
    (error: unknown) => recoverDealerSession(queryClient, setLocation, error),
    [queryClient, setLocation],
  );
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Login failed");
      }
      return res.json() as Promise<{ user: AuthUser }>;
    },
    onSuccess: ({ user }) => {
      queryClient.setQueryData(AUTH_KEY, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(AUTH_KEY, null);
      window.location.href = `${import.meta.env.BASE_URL}login`;
    },
  });
}
