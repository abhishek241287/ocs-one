import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CanonicalCaptureInput } from "@workspace/api-zod";
import { getCaptureAdapter } from "./adapters";
import { normalizeAttribute } from "./normalize";
import { resolveTemplate } from "./resolve";
import { validateCapture, type TemplateField } from "./validate";
import type { UnitRow } from "./units";

const registry: UnitRow[] = [
  {
    unitCode: "AH",
    dimension: "ELECTRICAL_CAPACITY",
    canonicalUnit: "AH",
    conversionFactor: "1",
  },
  {
    unitCode: "mAH",
    dimension: "ELECTRICAL_CAPACITY",
    canonicalUnit: "AH",
    conversionFactor: "1000",
  },
  {
    unitCode: "KG",
    dimension: "MASS",
    canonicalUnit: "KG",
    conversionFactor: "1",
  },
];

const baseField: TemplateField = {
  attributeId: "capacity-id",
  attributeCode: "capacity",
  dataType: "DECIMAL",
  required: true,
  sequence: 1,
  defaultValue: null,
  unitCode: "AH",
  allowedUnits: ["AH", "mAH"],
  allowedValues: null,
  precision: 8,
  scale: 2,
  minValue: null,
  maxValue: null,
  regex: null,
  maxLength: null,
};

function capture(
  value: unknown,
  suppliedUnit: string | null = null,
  field: TemplateField = baseField,
  raw: unknown = value,
) {
  return validateCapture(
    {
      attributes: [
        {
          attribute_code: field.attributeCode,
          raw,
          value,
          supplied_unit: suppliedUnit,
        },
      ],
    },
    [field],
    registry,
  );
}

function fieldWith(overrides: Partial<TemplateField>): TemplateField {
  return { ...baseField, ...overrides };
}

// 1. Contract parsing keeps raw evidence separate from parsed value/unit.
const parsedContract = CanonicalCaptureInput.parse({
  material_id: randomUUID(),
  quantity: 1,
  attributes: [
    {
      attribute_code: "capacity",
      raw: "280 AH",
      value: 280,
      supplied_unit: "AH",
    },
  ],
  source: { type: "MANUAL" },
});
assert.equal(parsedContract.attributes[0]?.value, 280);
assert.equal(parsedContract.attributes[0]?.supplied_unit, "AH");

// 1. "280 AH", "280", and 280 converge through value/supplied_unit.
const canonicalForms = [
  capture(280, "AH", baseField, "280 AH"),
  capture("280", null, baseField, "280"),
  capture(280, null, baseField, 280),
];
for (const result of canonicalForms) {
  assert.equal(result.ok, true);
  assert.equal(result.values[0]?.valueNum, "280");
  assert.equal(result.values[0]?.unit, "AH");
}

// 2. Blank is null; zero remains zero.
assert.equal(normalizeAttribute("", "DECIMAL", null).value, null);
assert.equal(normalizeAttribute("0", "DECIMAL", null).value, "0");
assert.equal(normalizeAttribute("0.00", "DECIMAL", null).value, "0.00");

// 3. Excess scale is rejected, never rounded.
const scaleFailure = capture("10.256");
assert.equal(scaleFailure.ok, false);
assert.equal(scaleFailure.errors[0]?.rule, "SCALE");
assert.notEqual(scaleFailure.errors[0]?.normalized, "10.26");

// 4. Decimal strings, including trailing zeroes, control scale.
assert.equal(capture("0.10").ok, true);
const trailingScaleFailure = capture("0.100");
assert.equal(trailingScaleFailure.ok, false);
assert.equal(trailingScaleFailure.errors[0]?.rule, "SCALE");

// 5. Dropdown values store the configured canonical spelling.
const dropdown = validateCapture(
  { attributes: [{ attribute_code: "chemistry", value: "lifepo4" }] },
  [
    fieldWith({
      attributeId: "chemistry-id",
      attributeCode: "chemistry",
      dataType: "DROPDOWN",
      unitCode: null,
      allowedUnits: null,
      allowedValues: ["LiFePO4", "NMC"],
      precision: null,
      scale: null,
    }),
  ],
  registry,
);
assert.equal(dropdown.ok, true);
assert.equal(dropdown.values[0]?.valueText, "LiFePO4");

// 6. Boolean spellings use the single centralized map.
const boolean = validateCapture(
  { attributes: [{ attribute_code: "enabled", value: "yes" }] },
  [
    fieldWith({
      attributeId: "enabled-id",
      attributeCode: "enabled",
      dataType: "BOOLEAN",
      unitCode: null,
      allowedUnits: null,
      allowedValues: null,
      precision: null,
      scale: null,
    }),
  ],
  registry,
);
assert.equal(boolean.ok, true);
assert.equal(boolean.values[0]?.valueBool, true);

// 7. Duplicate codes fail before a Map can overwrite one input.
const duplicate = validateCapture(
  {
    attributes: [
      { attribute_code: "capacity", value: "280" },
      { attribute_code: "capacity", value: "281" },
    ],
  },
  [baseField],
  registry,
);
assert.equal(duplicate.ok, false);
assert.equal(duplicate.errors[0]?.rule, "DUPLICATE_ATTRIBUTE");

// 8. A unitless attribute rejects supplied units.
const unitless = capture(
  "50",
  "KG",
  fieldWith({ unitCode: null, allowedUnits: null }),
);
assert.equal(unitless.ok, false);
assert.equal(unitless.errors[0]?.rule, "UNIT_NOT_ALLOWED");

// 9. Unknown units are rejected.
const unknownUnit = capture("280", "XYZ");
assert.equal(unknownUnit.ok, false);
assert.equal(unknownUnit.errors[0]?.rule, "UNIT");

// 10. Units from another dimension are rejected.
const wrongDimension = capture("280", "KG");
assert.equal(wrongDimension.ok, false);
assert.equal(wrongDimension.errors[0]?.rule, "UNIT_DIMENSION");

// 11. Numeric attributes without a canonical unit are configuration errors.
const missingCanonicalUnit = capture(
  "280",
  null,
  fieldWith({ unitCode: null, allowedUnits: null }),
);
assert.equal(missingCanonicalUnit.ok, false);
assert.equal(missingCanonicalUnit.errors[0]?.rule, "CONFIGURATION");

// 12. A default satisfies required and remains DEFAULT provenance.
const defaulted = validateCapture(
  { attributes: [] },
  [fieldWith({ defaultValue: "280" })],
  registry,
);
assert.equal(defaulted.ok, true);
assert.equal(defaulted.values[0]?.valueNum, "280");
assert.equal(defaulted.values[0]?.valueOrigin, "DEFAULT");

// 13. Explicit zero remains EXPLICIT provenance.
const explicitZero = capture("0");
assert.equal(explicitZero.ok, true);
assert.equal(explicitZero.values[0]?.valueNum, "0");
assert.equal(explicitZero.values[0]?.valueOrigin, "EXPLICIT");

// 14. Required and unknown-attribute errors remain machine-readable.
const required = validateCapture({ attributes: [] }, [baseField], registry);
assert.equal(required.ok, false);
assert.equal(required.errors[0]?.rule, "REQUIRED");
const unknown = validateCapture(
  { attributes: [{ attribute_code: "not_in_template", value: "x" }] },
  [],
  registry,
);
assert.equal(unknown.ok, false);
assert.equal(unknown.errors[0]?.rule, "UNKNOWN_ATTRIBUTE");

// 15. Conversion happens before canonical precision.
const conversionPrecision = capture(
  "280",
  "mAH",
  fieldWith({ precision: 4, scale: null }),
);
assert.equal(conversionPrecision.ok, false);
assert.equal(conversionPrecision.errors[0]?.rule, "PRECISION");
assert.equal(conversionPrecision.errors[0]?.normalized, "280000");

// 16. Date parsing is strict.
const dateField = fieldWith({
  attributeId: "date-id",
  attributeCode: "received_on",
  dataType: "DATE",
  unitCode: null,
  allowedUnits: null,
  allowedValues: null,
  precision: null,
  scale: null,
});
const invalidDate = validateCapture(
  { attributes: [{ attribute_code: "received_on", value: "14/09/2026" }] },
  [dateField],
  registry,
);
assert.equal(invalidDate.ok, false);
assert.equal(invalidDate.errors[0]?.rule, "TYPE");
const validDate = validateCapture(
  { attributes: [{ attribute_code: "received_on", value: "2026-09-14" }] },
  [dateField],
  registry,
);
assert.equal(validDate.ok, true);

// 17. Resolution uses the supplied date and effective windows.
const today = new Date("2026-09-14T00:00:00Z");
const tomorrow = new Date("2026-09-15T00:00:00Z");
const versioned = (resolutionDate: Date) =>
  resolveTemplate({
    materialMappings: [{ templateId: "material-template" }],
    categoryMappings: [{ templateId: "category-template" }],
    versions: () => [
      {
        templateVersionId: "v2",
        status: "ACTIVE",
        effectiveFrom: today,
        effectiveTo: tomorrow,
      },
      {
        templateVersionId: "v3",
        status: "ACTIVE",
        effectiveFrom: tomorrow,
        effectiveTo: null,
      },
    ],
    resolutionDate,
  });
assert.deepEqual(versioned(today), {
  kind: "OK",
  templateId: "material-template",
  templateVersionId: "v2",
});
assert.deepEqual(versioned(tomorrow), {
  kind: "OK",
  templateId: "material-template",
  templateVersionId: "v3",
});

// 18. Resolver-level ambiguity is an error even when DB uniques normally help.
const ambiguous = resolveTemplate({
  materialMappings: [
    { templateId: "material-template-a" },
    { templateId: "material-template-b" },
  ],
  categoryMappings: [],
  versions: () => [],
  resolutionDate: today,
});
assert.deepEqual(ambiguous, {
  kind: "ERROR",
  reason: "AMBIGUOUS_MATERIAL",
});

// 19. No confirmation adapter is registered until 71-D.
assert.throws(
  () => getCaptureAdapter("GRN_LINE"),
  /UNREGISTERED_TARGET/,
);

console.log("CAPTURE ENGINE SMOKE PASS");