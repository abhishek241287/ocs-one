export const AUTH_KEY = ["auth", "me"] as const;
export const DEALER_SESSION_CHANGED_REASON = "dealer-access-changed";
export const DEALER_SESSION_CHANGED_MESSAGE =
  "Your dealership access changed. Please sign in again.";

const SESSION_EXPIRED_ERROR = "Session is no longer valid. Please log in again.";

export function isDealerSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    data?: { error?: unknown } | null;
  };

  return candidate.status === 401 && candidate.data?.error === SESSION_EXPIRED_ERROR;
}

export interface AuthCache {
  setQueryData: (queryKey: readonly unknown[], data: unknown) => unknown;
}

export function recoverDealerSession(
  queryClient: AuthCache,
  navigate: (path: string) => void,
  error: unknown,
): boolean {
  if (!isDealerSessionExpiredError(error)) return false;

  navigate(`/login?reason=${DEALER_SESSION_CHANGED_REASON}`);
  queryClient.setQueryData(AUTH_KEY, null);
  return true;
}