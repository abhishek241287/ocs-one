// Types scoped to the Authentication feature.

export interface LoginCredentials {
  emailOrMobile: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  facilityId: string;
}

export type UserRole =
  | "super_admin"
  | "plant_manager"
  | "production_engineer"
  | "qc_inspector"
  | "dispatch_operator"
  | "service_technician"
  | "viewer";

export interface AuthToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}
