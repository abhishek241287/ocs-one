/**
 * Phase 6 — deterministic template resolution (Constitution A6).
 *
 * A material mapping wins over a category mapping. The database partial
 * uniques prevent active ties; this function remains defensive at the edge.
 */
export type Resolution =
  | { kind: "OK"; templateId: string; templateVersionId: string }
  | { kind: "NO_TEMPLATE" }
  | { kind: "ERROR"; reason: string };

export function resolveTemplate(params: {
  materialMapping: { templateId: string; activeVersionId: string } | null;
  categoryMapping: { templateId: string; activeVersionId: string } | null;
}): Resolution {
  if (params.materialMapping) {
    return {
      kind: "OK",
      templateId: params.materialMapping.templateId,
      templateVersionId: params.materialMapping.activeVersionId,
    };
  }
  if (params.categoryMapping) {
    return {
      kind: "OK",
      templateId: params.categoryMapping.templateId,
      templateVersionId: params.categoryMapping.activeVersionId,
    };
  }
  return { kind: "NO_TEMPLATE" };
}