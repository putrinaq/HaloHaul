import Link from "next/link";

/**
 * Compact segmented pill from the modal design, used as an in-page section
 * switcher. Plain anchor links: no JavaScript, and Lenis smooth-scrolls them.
 */
export function SectionTabs({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-md">
      {items.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            i === 0
              ? "flex min-h-11 items-center rounded-lg bg-white/12 px-4 text-sm sm:min-h-0 sm:py-1.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-white/18"
              : "flex min-h-11 items-center rounded-lg px-4 text-sm text-white/60 sm:min-h-0 sm:py-1.5 transition-colors hover:bg-white/8 hover:text-white"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
