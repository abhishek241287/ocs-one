import type {
  GradingImportSource,
  GradingImportSourceType,
  GradingMeasurementRecord,
} from "./types";

/**
 * Reference adapter: Manual Entry expressed as a single-record import source.
 *
 * This proves the framework's central claim — manual entry is just the trivial case
 * of an import (one operator-typed row). Any future bulk adapter (Excel/CSV) emits the
 * same `GradingMeasurementRecord[]`, so all sources converge on one grading engine.
 *
 * NOTE: this is an extension-point reference only. The certified `POST /:id/grade`
 * route is deliberately LEFT UNCHANGED in Phase 1 so the manual workflow remains the
 * certified reference implementation; wiring the live route through this adapter is a
 * later, re-certified phase.
 */
export class ManualGradingSource implements GradingImportSource {
  readonly sourceType: GradingImportSourceType = "manual";

  constructor(private readonly record: GradingMeasurementRecord) {}

  read(): GradingMeasurementRecord[] {
    return [this.record];
  }
}
