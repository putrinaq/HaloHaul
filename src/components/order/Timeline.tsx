import { Check } from "lucide-react";
import type { OrderStatus, ShippingMode } from "@/domain/enums";
import { journeyProgress } from "@/domain/journey";
import { STATUS_LABELS } from "@/domain/labels";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Timeline({
  status,
  mode,
  history,
}: {
  status: OrderStatus;
  mode: ShippingMode;
  history: Array<{ toStatus: OrderStatus; note: string | null; createdAt: Date }>;
}) {
  const steps = journeyProgress(
    status,
    mode,
    history.map((h) => h.toStatus).filter((s) => s !== "cancelled" && s !== "rejected"),
  );
  return (
    <section className="rounded-2xl bg-card p-5">
      <h2 className="font-medium">Progress</h2>
      <ol className="mt-4 space-y-0">
        {steps.map((s, i) => {
          const reached = history.filter((h) => s.statuses.includes(h.toStatus));
          const last = reached.at(-1);
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn("absolute top-6 left-[11px] h-full w-px", s.state === "done" ? "bg-white/60" : "bg-white/15")}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border",
                  s.state === "done" && "border-white bg-white text-black",
                  s.state === "current" && "border-white bg-black ring-4 ring-white/15",
                  s.state === "upcoming" && "border-white/25 bg-black",
                )}
              >
                {s.state === "done" ? <Check className="size-3.5" /> : null}
              </span>
              <div className={cn("text-sm", s.state === "upcoming" && "text-muted-foreground")}>
                <p className="font-medium">{s.title}</p>
                {s.state === "current" ? <p className="text-muted-foreground">{STATUS_LABELS[status].detail}</p> : null}
                {last ? <p className="text-xs text-muted-foreground">{fmtDateTime(last.createdAt)}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {status === "cancelled" || status === "rejected" ? (
        <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm">
          {STATUS_LABELS[status].title}: {history.at(-1)?.note ?? STATUS_LABELS[status].detail}
        </p>
      ) : null}
    </section>
  );
}
