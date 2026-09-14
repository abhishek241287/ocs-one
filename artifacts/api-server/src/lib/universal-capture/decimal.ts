/**
 * Phase 6 — string-decimal authority (Constitution A8).
 *
 * Canonical precision, scale, and range checks must not observe a binary
 * floating-point intermediate. Conversion may use the registry's numeric
 * factor, but its result is immediately normalized back to a plain string.
 */
export function decimalString(value: number | string): string {
  const result = typeof value === "number" ? String(value) : value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(result)) {
    throw new Error(`Not a plain decimal: ${result}`);
  }
  return result;
}

export function decimalSignificants(value: string): number {
  const digits = value
    .replace("-", "")
    .replace(".", "")
    .replace(/^0+/, "");
  return Math.max(1, digits.length);
}

export function decimalScale(value: string): number {
  const point = value.indexOf(".");
  return point < 0 ? 0 : value.length - point - 1;
}

export function decimalCompare(a: string, b: string): number {
  const left = decimalString(a);
  const right = decimalString(b);
  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");
  const leftUnsigned = left.replace("-", "");
  const rightUnsigned = right.replace("-", "");
  const [leftWhole, leftFraction = ""] = leftUnsigned.split(".");
  const [rightWhole, rightFraction = ""] = rightUnsigned.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftInteger = BigInt(
    `${leftWhole}${leftFraction.padEnd(scale, "0")}`,
  );
  const rightInteger = BigInt(
    `${rightWhole}${rightFraction.padEnd(scale, "0")}`,
  );
  const unsignedComparison =
    leftInteger === rightInteger ? 0 : leftInteger < rightInteger ? -1 : 1;
  if (leftNegative && !rightNegative) return -1;
  if (!leftNegative && rightNegative) return 1;
  return leftNegative ? -unsignedComparison : unsignedComparison;
}