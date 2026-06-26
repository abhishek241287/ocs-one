// Central API client.
// All HTTP calls should flow through this module so that auth headers,
// error handling, and base URL config live in exactly one place.

import { APP_CONFIG } from "@/config";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
}

interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

// Retrieve the stored JWT access token (when auth is implemented).
function getAccessToken(): string | null {
  return localStorage.getItem("ocs_access_token");
}

async function request<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {}
): Promise<TResponse> {
  const { method = "GET", body, headers = {} } = options;

  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      message: "Request failed",
    };
    try {
      const json = await response.json();
      error.message = json.message ?? error.message;
      error.details = json;
    } catch {
      // Non-JSON error body — ignore
    }
    throw error;
  }

  // 204 No Content
  if (response.status === 204) return undefined as TResponse;

  return response.json() as Promise<TResponse>;
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: "GET", headers }),

  post: <T, B = unknown>(path: string, body: B) =>
    request<T, B>(path, { method: "POST", body }),

  put: <T, B = unknown>(path: string, body: B) =>
    request<T, B>(path, { method: "PUT", body }),

  patch: <T, B = unknown>(path: string, body: B) =>
    request<T, B>(path, { method: "PATCH", body }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
