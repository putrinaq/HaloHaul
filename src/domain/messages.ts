// WhatsApp message templates (Messages page and the order's wa.me button).
// Templates are plain text with {{variable}} placeholders from a fixed list —
// substitution only, no expressions.

export const TEMPLATE_KEYS = ["quote_sent", "payment_received", "bought", "arrived", "ready_for_pickup", "needs_info"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  quote_sent: "Quote sent",
  payment_received: "Payment received",
  bought: "Bought from seller",
  arrived: "Arrived in Malaysia",
  ready_for_pickup: "Ready for pickup",
  needs_info: "Needs info",
};

export const TEMPLATE_VARIABLES = ["name", "order", "item", "amount", "pickup_window", "pickup_point", "tracking"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  quote_sent: "Hi {{name}}! Your quote for order {{order}} ({{item}}) is ready: {{amount}}. Review and accept it on HaloHaul when you're ready.",
  payment_received: "Hi {{name}}, we've received your payment of {{amount}} for order {{order}}. Thank you! We'll buy it from the seller next.",
  bought: "Hi {{name}}, good news — we've bought {{item}} (order {{order}}) from the seller. We'll let you know when it reaches the warehouse.",
  arrived: "Hi {{name}}, your order {{order}} ({{item}}) has arrived in Malaysia. We'll confirm the pickup time shortly.",
  ready_for_pickup: "Hi {{name}}, order {{order}} ({{item}}) is ready for pickup at {{pickup_point}}. {{pickup_window}}",
  needs_info: "Hi {{name}}, we need a little more info about order {{order}} ({{item}}) before we can continue. Could you check your order on HaloHaul?",
};

/** Fills {{variable}} placeholders; unknown or missing variables become empty. */
export function renderTemplate(template: string, vars: Partial<Record<TemplateVariable, string>>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => ((TEMPLATE_VARIABLES as readonly string[]).includes(name) ? (vars[name as TemplateVariable] ?? "") : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A wa.me link with the message prefilled. Phone in E.164 (+60…). */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
