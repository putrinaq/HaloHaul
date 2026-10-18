import {
  Bell,
  Boxes,
  CalendarDays,
  ChartColumn,
  CreditCard,
  House,
  MessagesSquare,
  Settings,
  ShoppingBag,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone's bottom bar; the rest live under "More". */
  mobile?: boolean;
  /** One line for the placeholder page until the section is built. */
  blurb: string;
}

/** Order from the brief (§7). Actions is the landing page. */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Actions", icon: Bell, mobile: true, blurb: "Orders waiting on you, oldest first." },
  { href: "/admin/dashboard", label: "Dashboard", icon: House, blurb: "Today at a glance: new orders, cutoffs and money in." },
  { href: "/admin/batches", label: "Batches", icon: Boxes, mobile: true, blurb: "Create and lock batches, consolidation summaries and the weigh-in." },
  { href: "/admin/products", label: "Products", icon: ShoppingBag, blurb: "Showcase cards on the home page and catalogue, with a publish toggle." },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, blurb: "Cutoffs and pickup windows for the month." },
  { href: "/admin/payment", label: "Payment", icon: CreditCard, mobile: true, blurb: "DuitNow proofs to confirm or reject, and each order's ledger." },
  { href: "/admin/customer", label: "Customer", icon: UserRound, mobile: true, blurb: "Customers with their order history and saved measurements." },
  { href: "/admin/messages", label: "Messages", icon: MessagesSquare, blurb: "One-tap WhatsApp links with saved message templates." },
  { href: "/admin/report", label: "Report", icon: ChartColumn, blurb: "Revenue by batch, orders by category and time spent in each status." },
];

/** Reached from the avatar menu (desktop) and the More sheet (phone), not the sidebar. */
export const SETTINGS_NAV: AdminNavItem = { href: "/admin/settings", label: "Settings", icon: Settings, blurb: "Categories, rates, fees and templates." };

/** Which nav item shows which badge count. */
export type NavCounts = { actions: number; payments: number };
export function badgeFor(item: AdminNavItem, counts: NavCounts): number {
  if (item.href === "/admin") return counts.actions;
  if (item.href === "/admin/payment") return counts.payments;
  return 0;
}

export function isActive(item: AdminNavItem, pathname: string): boolean {
  // Order pages belong to Actions, where they're opened from.
  if (item.href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/orders");
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
