"use client";

import { CircleCheckBig, Clock, ShieldAlert, SquareArrowOutUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton } from "@/components/admin/ActionButton";
import { useToast } from "@/components/admin/Toast";
import { Pagination } from "@/components/admin/ui";
import { ACTION_FILTERS, waiting, type ActionFilter, type PaymentTone } from "@/domain/adminQueue";
import type { PathType } from "@/domain/enums";
import { ADMIN_PATH_LABELS, ADMIN_STATUS_LABELS, PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { fmtDate, orderNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardPage, QueueItem } from "@/server/data/admin";

const PATH_TONE: Record<PathType, string> = {
  url: "border-orange-400/60 text-orange-300",
  reverse_search: "border-sky-400/60 text-sky-300",
  consultation: "border-violet-400/60 text-violet-300",
  digital: "border-emerald-400/60 text-emerald-300",
};

const PAYMENT_DOT: Record<PaymentTone, string> = {
  muted: "bg-white/30",
  pending: "bg-sky-400",
  paid: "bg-success",
  warning: "bg-warning",
};

const WAITING_TONE = ["text-white/55", "text-warning", "text-destructive"] as const;

/** Id *and* status: the next step can put the same order straight back on the board (QC review → "Approve QC"). */
const cardKey = (i: QueueItem) => `${i.id}:${i.status}`;

const filterHref = (key: ActionFilter, page = 1) => {
  const q = new URLSearchParams();
  if (key !== "all") q.set("filter", key);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
};

export function ActionBoard({ board, filter, now }: { board: BoardPage; filter: ActionFilter; now: number }) {
  const router = useRouter();
  // Cards animating out after their action, then hidden until the refreshed list arrives.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const say = useToast();

  const shown = useMemo(() => board.items.filter((i) => !gone.has(cardKey(i))), [board.items, gone]);
  const groups = groupByDay(shown, now);
  const nowDate = new Date(now);

  const leaveEnd = (key: string) => {
    setGone((s) => new Set(s).add(key));
    router.refresh();
  };
  const done = (key: string, text: string) => {
    say(text, "ok");
    // No exit animation under reduced motion, so nothing would fire animationend.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) leaveEnd(key);
    else setLeaving((s) => new Set(s).add(key));
  };
  const stale = (text: string) => {
    say(text, "warn");
    router.refresh();
  };

  return (
    <div className="mt-6">
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Stat label="Waiting on you" value={board.stats.total} />
        <Stat label="Waiting 2+ days" value={board.stats.overdue} tone={board.stats.overdue ? "text-warning" : undefined} />
        <Stat label="New requests" value={board.stats.newRequests} />
      </dl>

      <nav aria-label="Filter" className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {ACTION_FILTERS.map((f) => (
          <Link key={f.key} href={filterHref(f.key)} aria-current={filter === f.key ? "page" : undefined} className="admin-chip" scroll={false}>
            {f.label}
            {board.counts[f.key] > 0 ? <span className="text-xs tabular-nums opacity-60">{board.counts[f.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Empty filtered={filter !== "all" && board.stats.total > 0} />
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`}>
              <div className="flex items-center gap-3">
                <h2 id={`day-${g.key}`} className="text-lg font-medium">
                  {g.label}
                </h2>
                <span className="text-sm text-white/45 tabular-nums">{g.items.length}</span>
                <span aria-hidden className="h-px flex-1 bg-white/10" />
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {g.items.map((item, i) => {
                  const key = cardKey(item);
                  return (
                    <li
                      key={key}
                      className={cn("flex", leaving.has(key) ? "admin-card-out" : "admin-card-in")}
                      style={{ "--d": i }}
                      onAnimationEnd={(e) => {
                        if (e.target === e.currentTarget && leaving.has(key)) leaveEnd(key);
                      }}
                    >
                      <Card item={item} now={nowDate} onDone={(t) => done(key, t)} onStale={stale} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Pagination page={board.page} pageCount={board.pageCount} href={(p) => filterHref(filter, p)} />

    </div>
  );
}

function Card({ item, now, onDone, onStale }: { item: QueueItem; now: Date; onDone: (message: string) => void; onStale: (message: string) => void }) {
  const wait = waiting(item.waitingSince, now);
  const href = `/admin/orders/${item.id}`;
  return (
    <article className="flex w-full flex-col rounded-2xl border border-white/10 bg-neutral-950 p-4 transition-colors duration-300 hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-medium tracking-tight">
          <Link href={href} className="link-underline">
            Order {orderNo(item.id)}
          </Link>
        </h3>
        <span
          className={cn("mt-1 flex shrink-0 items-center gap-1 text-xs tabular-nums", WAITING_TONE[wait.level])}
          title={`In this step since ${fmtDate(item.waitingSince, "d MMM, h:mm a")}`}
        >
          <Clock className="size-3.5" aria-hidden />
          {wait.label}
        </span>
      </div>

      <p className="mt-2 truncate font-medium">{item.itemName}</p>
      <p className="truncate text-sm text-white/55">
        {item.customerName} · {item.categoryName}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-white/60">
        <span className={cn("rounded-md border px-1.5 py-0.5 leading-none", PATH_TONE[item.pathType])}>{ADMIN_PATH_LABELS[item.pathType]}</span>
        <span>{PLATFORM_LABELS[item.platform]}</span>
        <span aria-hidden>·</span>
        <span>{SHIPPING_MODE_LABELS[item.shippingMode]}</span>
        {item.restrictedHold ? (
          <span className="flex items-center gap-1 text-warning">
            <ShieldAlert className="size-3.5" aria-hidden />
            Restricted
          </span>
        ) : null}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-white/60">
        <span aria-hidden className={cn("size-1.5 rounded-full", PAYMENT_DOT[item.payment.tone])} />
        {item.payment.label}
        <span aria-hidden>·</span>
        {ADMIN_STATUS_LABELS[item.status]}
      </p>

      <div className="mt-auto flex gap-2 pt-4">
        <ActionButton
          orderId={item.id}
          status={item.status}
          action={item.action}
          restrictedReason={item.restrictedReason}
          onDone={onDone}
          onStale={onStale}
          className="flex-1"
        />
        <Link href={href} aria-label={`Open order ${orderNo(item.id)}`} title="Open order" className="admin-btn-secondary w-11 shrink-0 px-0 sm:w-10">
          <SquareArrowOutUpRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-white/55">{label}</dt>
      <dd className={cn("order-first text-2xl font-medium tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
        <CircleCheckBig className="size-6" aria-hidden />
      </span>
      <p className="mt-4 font-medium">{filtered ? "Nothing in this filter" : "All caught up"}</p>
      <p className="mt-1 max-w-xs text-sm text-white/55">{filtered ? "Other orders still need you." : "New orders and payment proofs will show up here."}</p>
      {filtered ? (
        <Link href="/admin" className="admin-btn-secondary mt-6">
          Show all
        </Link>
      ) : null}
    </div>
  );
}

/** Groups by the Malaysia-time day each order entered its current step, oldest day first. */
function groupByDay(items: QueueItem[], now: number) {
  const today = fmtDate(new Date(now), "yyyy-MM-dd");
  const yesterday = fmtDate(new Date(now - 86_400_000), "yyyy-MM-dd");
  const thisYear = fmtDate(new Date(now), "yyyy");
  const groups: { key: string; label: string; items: QueueItem[] }[] = [];
  for (const item of items) {
    const key = fmtDate(item.waitingSince, "yyyy-MM-dd");
    let group = groups.at(-1);
    if (group?.key !== key) {
      const label =
        key === today ? "Today" : key === yesterday ? "Yesterday" : fmtDate(item.waitingSince, key.startsWith(thisYear) ? "EEEE, d MMMM" : "d MMMM yyyy");
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
