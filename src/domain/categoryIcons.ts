// Icons a category can use (Lucide names). A fixed list, so the admin can
// pick one and the bundle only carries these.
export const CATEGORY_ICONS = [
  "Package",
  "Shirt",
  "Ruler",
  "Sparkle",
  "Heart",
  "Footprints",
  "Gem",
  "Glasses",
  "Eye",
  "Palette",
  "Smartphone",
  "Laptop",
  "Headphones",
  "Watch",
  "Download",
  "Gamepad2",
  "BookOpen",
  "Baby",
  "Dumbbell",
  "Home",
  "Utensils",
  "Car",
  "Gift",
  "ShoppingBag",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export function isCategoryIcon(v: unknown): v is CategoryIcon {
  return (CATEGORY_ICONS as readonly unknown[]).includes(v);
}
