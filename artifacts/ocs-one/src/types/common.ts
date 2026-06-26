// Shared types used across multiple features.
// Feature-specific types live in features/<name>/types/index.ts.

// ─── Identity & Timestamps ───────────────────────────────────────────────────

export type EntityId = string; // UUID v4

export interface Timestamps {
  createdAt: string; // ISO-8601
  updatedAt: string;
  deletedAt?: string; // soft-delete marker
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── API Envelope ─────────────────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── UI Utilities ─────────────────────────────────────────────────────────────

export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: string;
  direction: SortDirection;
}
