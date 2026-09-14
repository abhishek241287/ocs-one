export interface MappingCandidate {
  templateId: string;
}

export interface VersionCandidate {
  templateVersionId: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export type TemplateResolution =
  | { kind: "OK"; templateId: string; templateVersionId: string }
  | { kind: "NO_TEMPLATE" }
  | { kind: "ERROR"; reason: string };

export function resolveTemplate(params: {
  materialMappings: MappingCandidate[];
  categoryMappings: MappingCandidate[];
  versions: (mapping: MappingCandidate) => VersionCandidate[];
  resolutionDate: Date;
}): TemplateResolution {
  const pick = (
    mappings: MappingCandidate[],
    label: string,
  ): TemplateResolution | null => {
    if (mappings.length > 1) {
      return { kind: "ERROR", reason: `AMBIGUOUS_${label}` };
    }
    if (mappings.length === 0) return null;

    const activeVersions = params.versions(mappings[0]).filter(
      (version) =>
        version.status === "ACTIVE" &&
        version.effectiveFrom <= params.resolutionDate &&
        (version.effectiveTo === null ||
          params.resolutionDate < version.effectiveTo),
    );
    if (activeVersions.length > 1) {
      return { kind: "ERROR", reason: `AMBIGUOUS_${label}_VERSION` };
    }
    if (activeVersions.length === 0) {
      return { kind: "ERROR", reason: `NO_ACTIVE_VERSION_${label}` };
    }
    return {
      kind: "OK",
      templateId: mappings[0].templateId,
      templateVersionId: activeVersions[0].templateVersionId,
    };
  };

  const material = pick(params.materialMappings, "MATERIAL");
  if (material) return material;
  const category = pick(params.categoryMappings, "CATEGORY");
  if (category) return category;
  return { kind: "NO_TEMPLATE" };
}