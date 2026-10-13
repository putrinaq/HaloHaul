import type { ShippingMode } from "./enums";
import type { Sen } from "./money";

/**
 * Captured on every order at the moment the student picks a shipping mode, to
 * feed the "speed vs price" report: what was offered, at what price range and
 * expected speed, and what they chose.
 */
export interface ShippingChoiceSnapshot {
  chosen: ShippingMode;
  category: string;
  capturedAt: string;
  options: Array<{
    mode: ShippingMode;
    minSen: Sen;
    maxSen: Sen;
    /** Expected days door to campus, as shown (e.g. next cutoff + transit). */
    etaDaysMin: number | null;
    etaDaysMax: number | null;
  }>;
}
