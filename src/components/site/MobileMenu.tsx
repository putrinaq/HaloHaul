"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type MenuLink = { href: string; label: string };

/** Top to bottom: a section that folds away, or a plain link. */
const MENU: Array<MenuLink | { title: string; links: MenuLink[] }> = [
  {
    title: "Ordering",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  { href: "/catalogue", label: "What people bought" },
  { href: "/shipping", label: "Shipping schedule" },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

/** The site's pages on phones, in a panel from the right (the header has room for them from md up). */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Menu"
        className="grid size-11 place-items-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/20 md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col border-l border-white/10 bg-neutral-950 shadow-[-30px_0_80px_-20px_rgb(0_0_0/0.9)] outline-none duration-300 ease-(--ease-out-expo) data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none"
        >
          <MenuBody close={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Mounted only while open, so reading the pathname never holds up prerendering. */
function MenuBody({ close }: { close: () => void }) {
  const pathname = usePathname();
  const [openedOn] = useState(pathname);
  // The browser's back button closes it too.
  useEffect(() => {
    if (pathname !== openedOn) close();
  }, [pathname, openedOn, close]);

  const open = MENU.find((m) => "links" in m && m.links.some((l) => l.href === pathname));
  return (
    <>
      <div className="flex items-center justify-between border-b border-white/10 py-3 pr-3 pl-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Dialog.Title className="sr-only">Menu</Dialog.Title>
        <Link href="/" onClick={close} className="flex min-h-11 items-center" aria-current={pathname === "/" ? "page" : undefined}>
          <Logo />
        </Link>
        <Dialog.Close className="grid size-11 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close menu</span>
        </Dialog.Close>
      </div>
      <nav aria-label="Site" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">
        <Accordion type="single" collapsible defaultValue={open && "title" in open ? open.title : "Ordering"}>
          {MENU.map((m) =>
            "href" in m ? (
              <Link
                key={m.href}
                href={m.href}
                onClick={close}
                aria-current={m.href === pathname ? "page" : undefined}
                className={cn(
                  "flex min-h-13 items-center border-b border-white/10 text-base font-medium transition-colors active:text-white",
                  m.href === pathname ? "text-sky-300" : "text-white",
                )}
              >
                {m.label}
              </Link>
            ) : (
              <AccordionItem key={m.title} value={m.title} className="border-white/10">
                <AccordionTrigger className="min-h-13 items-center py-3 text-base text-white hover:no-underline">{m.title}</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {m.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={close}
                          aria-current={l.href === pathname ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center rounded-xl px-3 text-[15px] no-underline! transition-colors active:bg-white/10",
                            l.href === pathname ? "bg-white/8 text-white" : "text-white/70",
                          )}
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ),
          )}
        </Accordion>
      </nav>
      <div className="border-t border-white/10 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Link href="/order/new" onClick={close} className="btn-primary w-full">
          Place an order
        </Link>
      </div>
    </>
  );
}
