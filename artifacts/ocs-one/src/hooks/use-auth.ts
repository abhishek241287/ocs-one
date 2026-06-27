import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: "director" | "supervisor" | "operator" | "viewer";
}

const AUTH_KEY = ["auth", "me"] as const;

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

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Registration failed");
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
