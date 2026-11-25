import { Check, CheckCheck, CircleAlert, Clock } from "lucide-react";
import type { WaStatus } from "@/domain/whatsapp";

const LABEL: Record<WaStatus, string> = { received: "Received", sending: "Sending", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent" };

/** WhatsApp's own marks: one tick sent, two delivered, two blue read. */
export function Ticks({ status }: { status: WaStatus }) {
  const Icon = status === "sending" ? Clock : status === "failed" ? CircleAlert : status === "sent" ? Check : CheckCheck;
  return (
    <>
      <Icon className={status === "read" ? "size-3.5 text-sky-400" : status === "failed" ? "size-3.5 text-destructive" : "size-3.5"} aria-hidden />
      <span className="sr-only">{LABEL[status]}</span>
    </>
  );
}
