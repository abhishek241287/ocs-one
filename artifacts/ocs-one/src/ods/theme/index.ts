/** ODS Theme — Design Token Index
 *  Import: `import { ods } from "@/ods/theme"`
 */
export { odsColors } from "./colors";
export { odsSpacing, odsRadius, odsShadows } from "./spacing";
export { odsTypography } from "./typography";

import { odsColors } from "./colors";
import { odsSpacing, odsRadius, odsShadows } from "./spacing";
import { odsTypography } from "./typography";

export const ods = {
  colors: odsColors,
  spacing: odsSpacing,
  radius: odsRadius,
  shadows: odsShadows,
  typography: odsTypography,
} as const;
