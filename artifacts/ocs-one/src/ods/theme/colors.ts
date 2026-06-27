/** ODS Design Tokens — Color Semantics
 *  All values are Tailwind class strings.
 *  Import from `@/ods/theme` or `@/ods/theme/colors`.
 */
export const odsColors = {
  status: {
    success: {
      fg: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
      badge: "bg-green-100 text-green-800 border border-green-200",
      dot: "bg-green-500",
    },
    warning: {
      fg: "text-yellow-700",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      badge: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      dot: "bg-yellow-500",
    },
    error: {
      fg: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-200",
      badge: "bg-red-100 text-red-800 border border-red-200",
      dot: "bg-red-500",
    },
    info: {
      fg: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
      badge: "bg-blue-100 text-blue-800 border border-blue-200",
      dot: "bg-blue-500",
    },
    neutral: {
      fg: "text-gray-600",
      bg: "bg-gray-50",
      border: "border-gray-200",
      badge: "bg-gray-100 text-gray-700 border border-gray-200",
      dot: "bg-gray-400",
    },
  },
  surface: {
    card: "bg-white border border-gray-100 shadow-sm rounded-lg",
    panel: "bg-gray-50/60 border border-gray-200 rounded-md",
    elevated: "bg-white shadow-md rounded-xl",
    page: "bg-gray-50 min-h-screen",
    input: "bg-white border border-gray-300 rounded-md",
  },
  brand: {
    primary: "text-orange-600",
    primaryBg: "bg-orange-600",
    primaryHover: "hover:bg-orange-700",
    primaryLight: "bg-orange-50 text-orange-700",
    primaryBorder: "border-orange-200",
  },
  text: {
    heading: "text-gray-900",
    body: "text-gray-700",
    muted: "text-gray-500",
    disabled: "text-gray-400",
    onDark: "text-white",
    link: "text-blue-600 hover:text-blue-800",
    danger: "text-red-700",
  },
} as const;
