"use client";

import type { DialogKind } from "@/domain/adminQueue";
import { OptionsDialog } from "./OptionsDialog";
import { BatchDialog, QcDialog, RefundDialog, RestrictedDialog } from "./OrderDrawers";
import { BalanceDialog, FeeDialog, PaymentDialog } from "./PaymentDialogs";
import { QuoteDialog } from "./QuoteDialog";
import type { DialogProps } from "./shared";

/** Opens the right drawer for a board action, in place (no navigation). */
export function OrderDialog({ kind, restrictedReason, ...props }: DialogProps & { kind: DialogKind; restrictedReason?: string | null }) {
  switch (kind) {
    case "quote":
      return <QuoteDialog {...props} />;
    case "fee":
      return <FeeDialog {...props} />;
    case "options":
      return <OptionsDialog {...props} />;
    case "payment":
      return <PaymentDialog {...props} />;
    case "balance":
      return <BalanceDialog {...props} />;
    case "qc":
      return <QcDialog {...props} />;
    case "batch":
      return <BatchDialog {...props} />;
    case "refund":
      return <RefundDialog {...props} />;
    case "restricted":
      return <RestrictedDialog {...props} reasonText={restrictedReason} />;
  }
}
