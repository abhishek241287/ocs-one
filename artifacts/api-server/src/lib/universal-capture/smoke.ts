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
    unitCode: "KAH",
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
  allowedUnits: ["AH", "KAH"],
  allowedValues: null,
  precision: 8,
  scale: 2,
  minValue: null,
  maxValue: null,
  regex: null,
  maxLength: null,
};

function capture(raw: unknown, field: TemplateField = baseField) {
  return validateCapture(
    { attributes: [{ attribute_code: field.attributeCode, raw }] },
    [field],
    registry,
  );
}

const canonicalForms = ["280 AH", "280", 280].map((raw) => capture(raw));
for (const result of canonicalForms) {
  assert.equal(result.ok, true);
  assert.deepEqual(result.values[0]?.valueNum, "280");
  assert.deepEqual(result.values[0]?.unit, "AH");
}

assert.equal(normalizeAttribute("", "DECIMAL", null).value, null);
assert.equal(normalizeAttribute("0", "DECIMAL", null).value, 0);
assert.equal(normalizeAttribute("0.00", "DECIMAL", null).value, 0);

const scaleFailure = capture("10.256");
assert.equal(scaleFailure.ok, false);
assert.equal(scaleFailure.errors[0]?.rule, "SCALE");

const dropdown = validateCapture(
  { attributes: [{ attribute_code: "chemistry", raw: "lifepo4" }] },
  [
    {
      ...baseField,
      attributeId: "chemistry-id",
      attributeCode: "chemistry",
      dataType: "DROPDOWN",
      unitCode: null,
      allowedUnits: null,
      allowedValues: ["LiFePO4", "NMC"],
      precision: null,
      scale: null,
    },
  ],
  registry,
);
assert.equal(dropdown.ok, true);
assert.equal(dropdown.values[0]?.valueText, "LiFePO4");

const boolean = validateCapture(
  { attributes: [{ attribute_code: "enabled", raw: "yes" }] },
  [
    {
      ...baseField,
      attributeId: "enabled-id",
      attributeCode: "enabled",
      dataType: "BOOLEAN",
      unitCode: null,
      allowedUnits: null,
      allowedValues: null,
      precision: null,
      scale: null,
    },
  ],
  registry,
);
assert.equal(boolean.ok, true);
assert.equal(boolean.values[0]?.valueBool, true);

const required = validateCapture({ attributes: [] }, [baseField], registry);
assert.equal(required.ok, false);
assert.equal(required.errors[0]?.rule, "REQUIRED");

const unknown = validateCapture(
  { attributes: [{ attribute_code: "not_in_template", raw: "x" }] },
  [],
  registry,
);
assert.equal(unknown.ok, false);
assert.equal(unknown.errors[0]?.rule, "UNKNOWN_ATTRIBUTE");

const wrongDimension = capture("10 KG");
assert.equal(wrongDimension.ok, false);
assert.equal(wrongDimension.errors[0]?.rule, "UNIT_DIMENSION");

const materialResolution = resolveTemplate({
  materialMapping: {
    templateId: "material-template",
    activeVersionId: "material-version",
  },
  categoryMapping: {
    templateId: "category-template",
    activeVersionId: "category-version",
  },
});
assert.deepEqual(materialResolution, {
  kind: "OK",
  templateId: "material-template",
  templateVersionId: "material-version",
});
assert.deepEqual(
  resolveTemplate({ materialMapping: null, categoryMapping: null }),
  { kind: "NO_TEMPLATE" },
);

const canonicalInput = CanonicalCaptureInput.parse({
  material_id: randomUUID(),
  quantity: 1,
  attributes: [],
  source: { type: "MANUAL" },
});
assert.equal(canonicalInput.source.type, "MANUAL");

assert.throws(
  () => getCaptureAdapter("GRN_LINE"),
  /UNREGISTERED_TARGET/,
);

console.log("CAPTURE ENGINE SMOKE PASS");