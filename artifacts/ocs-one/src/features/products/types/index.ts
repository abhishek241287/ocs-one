// Types scoped to the Products (catalogue) feature.

export type ProductCategory = "lifepo4_battery" | "solar_inverter" | "ev_charger" | "component" | "raw_material";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unit: string;
  specifications: Record<string, string | number>; // e.g. { voltage: "48V", capacity: "100Ah" }
  isActive: boolean;
  createdAt: string;
}
