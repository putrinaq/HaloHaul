"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const WIDTH = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

/**
 * Every admin modal: a panel that slides in from the right (full width on
 * phones), so an action never navigates away from the board or the order.
 * The footer sticks to the bottom, within thumb reach.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof WIDTH;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/10 bg-neutral-950 shadow-[-30px_0_80px_-20px_rgb(0_0_0/0.9)] outline-none",
            "duration-300 ease-(--ease-out-expo) data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none",
            WIDTH[size],
          )}
        >
          <header className="flex items-start gap-3 border-b border-white/10 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-white/55">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Details"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:size-9">
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
          {footer ? (
            <footer className="flex flex-col-reverse gap-2 border-t border-white/10 bg-neutral-950/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
