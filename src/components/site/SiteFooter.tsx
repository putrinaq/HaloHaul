import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/shipping", label: "Shipping schedule" },
  { href: "/catalogue", label: "What people bought" },
  { href: "/terms", label: "Terms" },
  { href: "/terms#privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-muted-foreground">Your personal buyer across China&apos;s platforms.</p>
        </div>
        {/* Phones: a two-column grid of 44px rows. Larger screens: one line. */}
        <nav className="grid grid-cols-2 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center transition-colors hover:text-foreground active:text-foreground sm:min-h-0"
            >
              <span className="link-underline">{l.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
