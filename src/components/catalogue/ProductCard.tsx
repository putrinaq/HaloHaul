import { Plane, Ship, Truck } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Platform, ShippingMode } from "@/domain/enums";
import { PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import { cn } from "@/lib/utils";

const MODE_ICON = { air: Plane, air_sensitive: Plane, sea: Ship, pdd_direct: Truck, none: null } as const;

export type ProductCardData = {
  id: string;
  title: string;
  variant: string | null;
  platform: Platform;
  shippingMode: ShippingMode;
  retailPriceSen: number;
  halohaulPriceSen: number;
  /** Presigned photo URL, or null for the gradient placeholder. */
  photo: string | null;
};

export function savedPercent(c: Pick<ProductCardData, "retailPriceSen" | "halohaulPriceSen">): number {
  return c.retailPriceSen > 0 ? Math.round((1 - c.halohaulPriceSen / c.retailPriceSen) * 100) : 0;
}

/**
 * One past order: photo, savings badge, platform and shipping chips, both
 * prices and an "Order for myself" link that prefills the order form. Shared
 * by the home page row and the /catalogue grid so they always match.
 */
export function ProductCard({
  card,
  className,
  style,
  ...rest
}: {
  card: ProductCardData;
  className?: string;
  style?: CSSProperties;
} & Record<`data-${string}`, string | boolean | undefined> & { role?: string }) {
  const saved = savedPercent(card);
  const Icon = MODE_ICON[card.shippingMode];
  return (
    <article
      {...rest}
      style={style}
      className={cn(
        "group flex flex-col rounded-2xl border border-white/10 bg-card p-2.5 transition-[border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-white/25 sm:p-3",
        className,
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-linear-to-br from-indigo-950 via-slate-900 to-black">
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL
          <img
            src={card.photo}
            alt={card.title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-700 ease-(--ease-out-expo) group-hover:scale-105"
          />
        ) : (
          <span aria-hidden className="display absolute inset-0 grid place-items-center text-4xl text-white/15">
            {card.title.charAt(0)}
          </span>
        )}
        {saved > 0 ? (
          <span className="absolute top-2 right-2 rounded-md bg-black/55 px-2 py-1 text-center leading-none backdrop-blur">
            <span className="block text-[9px] tracking-wider text-white/70">SAVED</span>
            <span className="text-sm font-semibold sm:text-base">{saved}%</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-white/12 px-2 py-0.5">{PLATFORM_LABELS[card.platform]}</span>
        {Icon ? (
          <span className="flex items-center gap-1 rounded-full bg-white/12 px-2 py-0.5">
            <Icon className="size-3" aria-hidden /> {SHIPPING_MODE_LABELS[card.shippingMode]}
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold sm:text-base">{card.title}</h3>
      {card.variant ? <p className="line-clamp-1 text-xs text-muted-foreground">{card.variant}</p> : null}
      {/* Narrow cards (2-up on phones): two rows, label left, amount right,
          never wrapping. From sm: side by side. */}
      <dl className="mt-auto space-y-0.5 pt-3 text-xs sm:flex sm:items-end sm:justify-between sm:gap-2 sm:space-y-0">
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Est. retail</dt>
          <dd className="text-xs whitespace-nowrap text-muted-foreground line-through tabular-nums sm:text-sm">
            {formatMyr(card.retailPriceSen)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
          <dt className="text-muted-foreground">Via HaloHaul</dt>
          <dd className="text-sm font-semibold whitespace-nowrap text-brand tabular-nums">
            {formatMyr(card.halohaulPriceSen)}
          </dd>
        </div>
      </dl>
      <Link
        href={`/order/new?showcase=${card.id}`}
        className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-white/12 text-xs font-medium transition-colors hover:bg-white/22 active:bg-white/25"
      >
        Order for myself
      </Link>
    </article>
  );
}
