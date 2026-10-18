"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { renderTemplate, waLink, type TemplateKey } from "@/domain/messages";

interface OrderOption {
  id: number;
  label: string;
  status: string;
  amount: string;
  tracking: string;
  pickupWindow: string;
}

/** Pick a template and an order; the message fills in and opens in WhatsApp. */
export function Composer({
  person,
  orders,
  templates,
  labels,
  pickupPoint,
}: {
  person: { id: string; name: string; phone: string };
  orders: OrderOption[];
  templates: Record<string, string>;
  labels: Record<TemplateKey, string>;
  pickupPoint: string;
}) {
  const id = useId();
  const [template, setTemplate] = useState<TemplateKey>("quote_sent");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? 0);
  const order = orders.find((o) => o.id === orderId);
  const message = renderTemplate(templates[template] ?? "", {
    name: person.name.split(/\s+/)[0],
    order: order ? `#${order.id}` : "",
    item: order ? order.label.replace(/^#\d+\s/, "") : "",
    amount: order?.amount ?? "",
    pickup_point: pickupPoint,
    pickup_window: order?.pickupWindow ?? "",
    tracking: order?.tracking ?? "",
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/admin/customer/${person.id}`} className="font-medium link-underline">
          {person.name}
        </Link>
        <span className="text-xs text-white/50 tabular-nums">{person.phone}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor={`${id}-t`} className="sr-only">
          Template
        </label>
        <select id={`${id}-t`} value={template} onChange={(e) => setTemplate(e.target.value as TemplateKey)} className="admin-input">
          {(Object.keys(labels) as TemplateKey[]).map((k) => (
            <option key={k} value={k}>
              {labels[k]}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-o`} className="sr-only">
          Order
        </label>
        <select id={`${id}-o`} value={orderId} onChange={(e) => setOrderId(Number(e.target.value))} className="admin-input" disabled={orders.length === 0}>
          {orders.length === 0 ? <option value={0}>No orders</option> : null}
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} ({o.status.replace(/_/g, " ")})
            </option>
          ))}
        </select>
      </div>
      <p className="rounded-xl bg-emerald-500/10 p-3 text-sm whitespace-pre-line text-emerald-50/90">{message}</p>
      <a href={waLink(person.phone, message)} target="_blank" rel="noopener noreferrer" className="admin-btn-primary w-full sm:w-auto">
        <MessageCircle className="size-4" aria-hidden />
        Open in WhatsApp
      </a>
    </div>
  );
}
