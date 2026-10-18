// The Settings sub-pages, in the order of the brief (§13).
export const SETTINGS_SECTIONS = [
  { href: "/admin/settings/categories", label: "Categories", blurb: "Order form fields per category, with versions and publishing." },
  { href: "/admin/settings/measurements", label: "Measurement library", blurb: "Body measurements shared by every category, with how-to-measure pictures." },
  { href: "/admin/settings/shipping", label: "Shipping rates", blurb: "Forwarder rates per mode in RMB, the spread, minimum charge and range widths." },
  { href: "/admin/settings/fees", label: "Fees", blurb: "Coordination, photo search, consultation, Lalamove, the reconciliation cap and quote validity." },
  { href: "/admin/settings/exchange-rate", label: "Exchange rate", blurb: "The RMB → MYR rate quotes start from, with its history." },
  { href: "/admin/settings/restricted", label: "Restricted items", blurb: "Keywords that hold an order for review, by mode and forwarder." },
  { href: "/admin/settings/pickup", label: "Pickup", blurb: "The campus pickup point and the window shown to students." },
  { href: "/admin/settings/messages", label: "Message templates", blurb: "WhatsApp templates with {{name}}, {{order}} and other variables." },
  { href: "/admin/settings/store", label: "Store", blurb: "The DuitNow QR students pay with and the business details on receipts." },
  { href: "/admin/settings/audit", label: "Change log", blurb: "Every settings change, publish and money correction: who and when." },
] as const;
