/**
 * Phase 6 — confirmation adapter wall (Constitution A3).
 *
 * Adapters are intentionally unregistered in 71-B. GRN_LINE is registered by
 * the certified GRN integration in 71-D.
 */
import type { CanonicalCaptureInput } from "@workspace/api-zod";
import type { ValidatedValue } from "./validate";

export interface CaptureAdapter {
  targetType: string;
  confirm(
    input: CanonicalCaptureInput,
    validated: ValidatedValue[],
  ): Promise<{ documentId: string }>;
}

const registry = new Map<string, CaptureAdapter>();

export function registerCaptureAdapter(adapter: CaptureAdapter): void {
  registry.set(adapter.targetType, adapter);
}

export function getCaptureAdapter(targetType: string): CaptureAdapter {
  const adapter = registry.get(targetType);
  if (!adapter) {
    throw new Error(`UNREGISTERED_TARGET: '${targetType}' has no adapter (A3)`);
  }
  return adapter;
}