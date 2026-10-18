import "server-only";
import type { OrderStatus } from "../domain/enums";

// The one place a student-visible order change is announced. Emails are
// switched off for now (decided 2026-10-18); when they're built, queue the
// pg-boss email job from here and every status change will send it — no other
// call sites to touch.

export interface StatusChange {
  orderId: number;
  from: OrderStatus | null;
  to: OrderStatus;
}

export function notifyStatusChange(change: StatusChange): void {
  // Intentionally a no-op until notification emails are switched on.
  void change;
}
