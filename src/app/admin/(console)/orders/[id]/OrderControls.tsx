"use client";

import { ChevronDown, Ellipsis, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useState, type ReactNode } from "react";
import { ActionButton } from "@/components/admin/ActionButton";
import { OrderDialog } from "@/components/admin/dialogs/OrderDialog";
import { CancelDialog, DetailsDialog, NeedsInfoDialog, NotesDialog, RejectDialog, TrackingDialog } from "@/components/admin/dialogs/OverflowDrawers";
import { RecordPaymentDialog } from "@/components/admin/dialogs/PaymentDialogs";
import { useToast } from "@/components/admin/Toast";
import type { AdminAction, DialogKind } from "@/domain/adminQueue";
import type { OrderStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

function useDone() {
  const router = useRouter();
  const toast = useToast();
  return {
    done: (message: string) => {
      toast(message);
      router.refresh();
    },
    stale: (message: string) => {
      toast(message, "warn");
      router.refresh();
    },
  };
}

/** The order's primary action; on phones it is also pinned above the bottom bar. */
export function PrimaryAction({
  orderId,
  status,
  action,
  restrictedReason,
  pinned = false,
}: {
  orderId: number;
  status: OrderStatus;
  action: AdminAction;
  restrictedReason: string | null;
  pinned?: boolean;
}) {
  const { done, stale } = useDone();
  const button = (
    <ActionButton orderId={orderId} status={status} action={action} restrictedReason={restrictedReason} onDone={done} onStale={stale} className="w-full sm:w-auto sm:min-w-56" />
  );
  if (!pinned) return button;
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-white/12 bg-neutral-950/90 p-2 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl lg:hidden">
      {button}
    </div>
  );
}

type Drawer = DialogKind | "record" | "needs_info" | "reject" | "cancel" | "notes" | "tracking" | "details";

function DrawerFor({
  drawer,
  orderId,
  open,
  setOpen,
  initial,
  restrictedReason,
}: {
  drawer: Drawer;
  orderId: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  initial?: { notes?: string | null; trackingNumber?: string | null; trackingNote?: string | null };
  restrictedReason?: string | null;
}) {
  const { done } = useDone();
  const props = {
    orderId,
    open,
    onOpenChange: setOpen,
    onDone: (m: string) => {
      setOpen(false);
      done(m);
    },
  };
  switch (drawer) {
    case "needs_info":
      return <NeedsInfoDialog {...props} />;
    case "reject":
      return <RejectDialog {...props} />;
    case "cancel":
      return <CancelDialog {...props} />;
    case "notes":
      return <NotesDialog {...props} initial={initial?.notes ?? null} />;
    case "tracking":
      return <TrackingDialog {...props} initial={{ trackingNumber: initial?.trackingNumber ?? null, trackingNote: initial?.trackingNote ?? null }} />;
    case "details":
      return <DetailsDialog {...props} />;
    case "record":
      return <RecordPaymentDialog {...props} />;
    default:
      return <OrderDialog {...props} kind={drawer} restrictedReason={restrictedReason} />;
  }
}

/** A secondary button that opens one of the order's drawers. */
export function DrawerButton({
  drawer,
  orderId,
  children,
  className = "admin-btn-secondary",
  initial,
}: {
  drawer: Drawer;
  orderId: number;
  children: ReactNode;
  className?: string;
  initial?: { notes?: string | null; trackingNumber?: string | null; trackingNote?: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <DrawerFor drawer={drawer} orderId={orderId} open={open} setOpen={setOpen} initial={initial} />
    </>
  );
}

/** Needs info / reject / cancel / note / tracking / edit details, where the state machine allows. */
export function OverflowMenu({
  orderId,
  can,
  initial,
}: {
  orderId: number;
  can: { needsInfo: boolean; reject: boolean; cancel: boolean };
  initial: { notes: string | null; trackingNumber: string | null; trackingNote: string | null };
}) {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const items: Array<{ drawer: Drawer; label: string; danger?: boolean; show: boolean }> = [
    { drawer: "needs_info", label: "Ask for more info", show: can.needsInfo },
    { drawer: "details", label: "Edit category details", show: true },
    { drawer: "tracking", label: "Tracking", show: true },
    { drawer: "notes", label: "Internal note", show: true },
    { drawer: "reject", label: "Reject order", danger: true, show: can.reject },
    { drawer: "cancel", label: "Cancel order", danger: true, show: can.cancel },
  ];
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger className="admin-btn-secondary w-11 px-0 sm:w-10" aria-label="More actions">
          <Ellipsis className="size-4" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-2xl border border-white/12 bg-neutral-950/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl">
            {items
              .filter((i) => i.show)
              .map((i) => (
                <DropdownMenu.Item
                  key={i.drawer}
                  onSelect={() => setDrawer(i.drawer)}
                  className={cn("flex h-10 cursor-pointer items-center rounded-xl px-3 text-sm outline-none data-highlighted:bg-white/10", i.danger ? "text-destructive" : "text-white/85")}
                >
                  {i.label}
                </DropdownMenu.Item>
              ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {drawer ? <DrawerFor drawer={drawer} orderId={orderId} open setOpen={(o) => !o && setDrawer(null)} initial={initial} /> : null}
    </>
  );
}

/** WhatsApp with a template message, filled in for this order. */
export function WhatsAppButton({ links }: { links: Array<{ label: string; href: string }> }) {
  if (links.length === 0) return null;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="admin-btn-secondary w-full justify-between">
        <span className="flex items-center gap-2">
          <MessageCircle className="size-4" aria-hidden />
          WhatsApp
        </span>
        <ChevronDown className="size-4 text-white/50" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={8} className="z-50 min-w-60 rounded-2xl border border-white/12 bg-neutral-950/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          <DropdownMenu.Label className="px-3 py-1.5 text-xs text-white/50">Send a template</DropdownMenu.Label>
          {links.map((l) => (
            <DropdownMenu.Item key={l.label} asChild>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center rounded-xl px-3 text-sm text-white/85 outline-none data-highlighted:bg-white/10">
                {l.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * A collapsible panel (all open to start; fold away what you don't need on a
 * phone). Buttons in the header don't toggle it.
 */
export function Section({ title, aside, actions, children }: { title: ReactNode; aside?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <details open className="admin-card group text-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="font-medium">{title}</h2>
        {aside}
        <span className="ml-auto flex items-center gap-3">
          {actions ? (
            <span onClick={(e) => e.preventDefault()} onKeyDown={(e) => e.key === " " && e.preventDefault()}>
              {actions}
            </span>
          ) : null}
          <ChevronDown className="size-4 text-white/40 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
