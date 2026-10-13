import type { OrderStatus } from "@/domain/enums";
import { STATUS_LABELS } from "@/domain/labels";
import { cn } from "@/lib/utils";

const TONE: Partial<Record<OrderStatus, string>> = {
  needs_info: "bg-warning/20 text-warning",
  quote_sent: "bg-brand/20 text-brand",
  awaiting_payment: "bg-brand/20 text-brand",
  ready_for_pickup: "bg-success/20 text-success",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-white/10 text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status] ?? "bg-white/10", className)}>
      {STATUS_LABELS[status].title}
    </span>
  );
}
