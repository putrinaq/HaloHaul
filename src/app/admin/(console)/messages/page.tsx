import { ArrowLeft, Download, MessagesSquare, Search, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { TEMPLATE_KEYS, TEMPLATE_LABELS } from "@/domain/messages";
import { formatMyr } from "@/domain/money";
import { templateText, type Settings } from "@/domain/settings";
import { isInlineMime, isMediaKind, isWindowOpen, previewOf, windowClosesAt } from "@/domain/whatsapp";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/data/catalog";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { evolutionConfig, linkState } from "@/server/whatsapp/evolution";
import { whatsappGateway } from "@/server/whatsapp/gateway";
import { getThread, inboxVersion, listChats, type ChatListItem, type Thread } from "@/server/whatsapp/inbox";
import { Composer, type ComposerOrder } from "./Composer";
import { LiveInbox, MarkRead, ThreadScroll } from "./LiveInbox";
import { OrdersPane } from "./OrdersPane";
import { Ticks } from "./Ticks";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<div className={cn(FRAME, "animate-pulse bg-white/5")} />}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

/** Fills the screen under the console's header (and above the phone's bottom bar), so only the panes scroll. */
const FRAME =
  "h-[calc(100dvh-11.75rem-env(safe-area-inset-bottom))] min-h-96 w-full overflow-hidden rounded-2xl border border-white/10 lg:h-[calc(100dvh-7rem)]";

async function load(sp: Awaited<PageProps<"/admin/messages">["searchParams"]>) {
  await requireAdmin();
  const db = getDb();
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const chatId = z.uuid().safeParse(sp.chat).data ?? null;
  const customerId = typeof sp.customer === "string" ? sp.customer.slice(0, 64) : null;
  const gateway = whatsappGateway();
  const evo = evolutionConfig();
  // The version first: anything that changes while the rest loads is then noticed.
  const version = await inboxVersion(db);
  const [chats, thread, settings, link] = await Promise.all([listChats(db, q), getThread(db, { chatId, customerId }), getSettings(db), evo ? linkState(evo) : null]);
  const now = new Date();
  const open = !gateway?.windowed || isWindowOpen(thread?.chat?.lastInboundAt ?? null, now);
  const [templates, photos] = await Promise.all([
    // Only needed when a free-form reply isn't allowed.
    gateway && thread && !open ? gateway.templates().catch(() => null) : [],
    imageUrlMap(getPhotoStore(), thread?.orders.flatMap((o) => o.photoKeys.slice(0, 1)) ?? []),
  ]);
  return { q, version, chats, thread, settings, templates, photos, open, connected: gateway !== null && (link === null || link === "open"), windowed: gateway?.windowed ?? false, linked: evo !== null, missing: (chatId !== null || customerId !== null) && !thread };
}

type Data = Awaited<ReturnType<typeof load>>;

async function Inbox({ searchParams }: { searchParams: PageProps<"/admin/messages">["searchParams"] }) {
  const data = await load(await searchParams);
  const { thread, chats, q } = data;
  return (
    <>
      <h1 className="sr-only">Messages</h1>
      <LiveInbox version={data.version} />
      <div className={cn(FRAME, "grid bg-neutral-950/60 lg:grid-cols-[19rem_1fr]", thread && "xl:grid-cols-[19rem_1fr_20rem]")}>
        <section aria-label="Chats" className={cn("flex min-h-0 flex-col border-white/10 lg:border-r", thread && "max-lg:hidden")}>
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <form action="/admin/messages" role="search" className="relative flex-1">
              <label htmlFor="mq" className="sr-only">
                Search chats
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" aria-hidden />
              <input id="mq" name="q" type="search" defaultValue={q} placeholder="Search chats" className="admin-input pl-9" />
            </form>
            <Link href="/admin/settings/messages" className="admin-btn-secondary w-11 px-0 sm:w-10" aria-label="Edit quick replies">
              <Settings2 className="size-4" aria-hidden />
            </Link>
          </div>
          {!data.connected ? (
            <p className="border-b border-white/10 bg-warning/10 px-4 py-2.5 text-xs leading-relaxed text-warning">
              {data.linked ? (
                <>
                  WhatsApp is disconnected, so new messages aren&apos;t arriving.{" "}
                  <Link href="/admin/settings/whatsapp" className="underline underline-offset-2">
                    Link it again
                  </Link>
                </>
              ) : (
                <>WhatsApp isn&apos;t connected yet. Send opens WhatsApp, and replies stay on your phone.</>
              )}
            </p>
          ) : null}
          {chats.length === 0 ? (
            <p className="p-6 text-center text-sm text-white/50">{q ? "Nobody matches that." : "Nobody to message yet. Numbers come from the order form and the account page."}</p>
          ) : (
            <ul data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {chats.map((c) => (
                <ChatRow key={c.key} chat={c} q={q} active={c.chatId ? c.chatId === thread?.chat?.id : !!thread && !thread.chat && thread.customers.some((p) => p.id === c.customerId)} />
              ))}
            </ul>
          )}
        </section>

        {thread ? (
          <>
            <Conversation key={thread.chat?.id ?? thread.phone} data={data} thread={thread} />
            <aside aria-label="Orders" data-lenis-prevent className="hidden min-h-0 overflow-y-auto overscroll-contain border-l border-white/10 p-4 xl:block">
              <OrdersPane thread={thread} photos={data.photos} />
            </aside>
          </>
        ) : (
          <div className="hidden place-items-center p-8 lg:grid">
            <EmptyState icon={MessagesSquare} title={data.missing ? "That chat isn't here any more" : "Choose a chat"} body="Their orders show on the right, so you can answer without leaving." />
          </div>
        )}
      </div>
    </>
  );
}

function ChatRow({ chat, q, active }: { chat: ChatListItem; q: string; active: boolean }) {
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(chat.chatId ? { chat: chat.chatId } : { customer: chat.customerId ?? "" }) });
  return (
    <li>
      <Link
        href={`/admin/messages?${params}`}
        scroll={false}
        aria-current={active ? "true" : undefined}
        className={cn("flex items-center gap-3 border-b border-white/6 px-3 py-3 transition-colors", active ? "bg-white/10" : "hover:bg-white/5")}
      >
        <Avatar name={chat.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{chat.name}</span>
            {chat.at ? <span className={cn("shrink-0 text-xs tabular-nums", chat.unread ? "text-emerald-400" : "text-white/40")}>{whenShort(chat.at)}</span> : null}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm", chat.unread ? "text-white/85" : "text-white/50")}>
              {chat.fromUs ? "You: " : ""}
              {chat.preview}
            </span>
            {chat.unread ? (
              <span className="min-w-5 shrink-0 rounded-full bg-emerald-500 px-1.5 text-center text-xs leading-5 font-medium text-black tabular-nums">
                {chat.unread}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium text-white/80 uppercase">
      {[...name.replace(/^[@+]/, "")][0] ?? "?"}
    </span>
  );
}

function whenShort(d: Date): string {
  const day = fmtDate(d, "yyyy-MM-dd");
  return day === fmtDate(new Date(), "yyyy-MM-dd") ? fmtDate(d, "h:mm a") : fmtDate(d, "d MMM");
}

function Conversation({ data, thread }: { data: Data; thread: Thread }) {
  const closes = windowClosesAt(thread.chat?.lastInboundAt ?? null);
  const dayOf = (d: Date) => fmtDate(d, "EEE, d MMM yyyy");
  return (
    <section aria-label={`Chat with ${thread.name}`} className="flex min-h-0 min-w-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 p-3">
        <Link href={`/admin/messages${data.q ? `?q=${encodeURIComponent(data.q)}` : ""}`} className="grid size-11 place-items-center rounded-full hover:bg-white/10 lg:hidden" aria-label="Back to chats">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Avatar name={thread.name} />
        <div className="min-w-0">
          <h2 className="truncate font-medium">{thread.name}</h2>
          <p className="truncate text-xs text-white/50 tabular-nums">
            {thread.phone ?? (thread.chat?.username ? `@${thread.chat.username}` : "Number hidden")}
            {data.connected && data.windowed && data.open && closes ? ` · reply freely until ${fmtDate(closes, "EEE h:mm a")}` : ""}
          </p>
        </div>
      </header>

      {/* Orders sit beside the chat on wide screens, and fold away above it otherwise. */}
      <details className="group border-b border-white/10 xl:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm text-white/75">
          Orders · {thread.orders.length}
          <span className="text-xs text-white/45 group-open:hidden">Show</span>
          <span className="hidden text-xs text-white/45 group-open:inline">Hide</span>
        </summary>
        <div data-lenis-prevent className="max-h-[40dvh] overflow-y-auto overscroll-contain p-4 pt-0">
          <OrdersPane thread={thread} photos={data.photos} />
        </div>
      </details>

      <ThreadScroll marker={thread.messages.at(-1)?.id ?? ""}>
        {thread.messages.length === 0 ? <p className="py-10 text-center text-sm text-white/45">No messages here yet.</p> : null}
        <ol className="space-y-1.5">
          {thread.messages.map((m, i, all) => {
            const day = dayOf(m.sentAt);
            const newDay = i === 0 || day !== dayOf(all[i - 1].sentAt);
            const out = m.direction === "out";
            return (
              <li key={m.id}>
                {newDay ? <p className="my-4 text-center text-xs text-white/45">{day}</p> : null}
                <div
                  className={cn(
                    "w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[75%]",
                    out ? "ml-auto rounded-br-md bg-emerald-600/30 text-emerald-50" : "rounded-bl-md bg-white/10 text-white/90",
                    m.status === "failed" && "border border-destructive/50 bg-destructive/10",
                  )}
                >
                  <span className="sr-only">{out ? "You: " : `${thread.name}: `}</span>
                  <MessageBody m={m} />
                  <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-white/50 tabular-nums">
                    {m.kind === "template" ? "template · " : ""}
                    {fmtDate(m.sentAt, "h:mm a")}
                    {out ? <Ticks status={m.status} /> : null}
                  </span>
                  {m.status === "failed" ? <p className="mt-1 text-xs text-destructive">Not sent. {m.error}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </ThreadScroll>

      {thread.chat && thread.chat.unread > 0 ? <MarkRead chatId={thread.chat.id} unread={thread.chat.unread} /> : null}
      <Composer
        target={thread.chat ? { chatId: thread.chat.id, customerId: null } : { chatId: null, customerId: thread.customers[0]?.id ?? null }}
        phone={thread.phone}
        firstName={thread.name.split(/\s+/)[0]}
        mode={!data.connected ? "link" : data.open ? "chat" : "template"}
        orders={composerOrders(thread, data.settings)}
        quickReplies={TEMPLATE_KEYS.map((k) => ({ label: TEMPLATE_LABELS[k], text: templateText(data.settings, k) }))}
        pickupPoint={data.settings.pickup.pointName}
        approved={data.templates}
      />
    </section>
  );
}

function MessageBody({ m }: { m: Thread["messages"][number] }) {
  if (!isMediaKind(m.kind)) {
    const plain = ["text", "template", "button", "interactive", "location", "reaction"].includes(m.kind) && m.body;
    return <p className={cn("break-words whitespace-pre-line", !plain && "text-white/55 italic")}>{plain ? m.body : previewOf(m.kind, m.body)}</p>;
  }
  const src = `/api/admin/whatsapp/media/${m.id}`;
  const mime = m.mediaMime ?? "";
  const inline = isInlineMime(mime);
  return (
    <>
      {!m.mediaId ? (
        <p className="text-white/55 italic">{previewOf(m.kind, null)}</p>
      ) : inline && mime.startsWith("image/") ? (
        <a href={src} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- private file, served through the admin check */}
          <img src={src} alt={`${previewOf(m.kind, null)} from the customer`} loading="lazy" className="max-h-72 min-h-16 min-w-16 rounded-xl object-contain" />
        </a>
      ) : inline && mime.startsWith("audio/") ? (
        <audio src={src} controls preload="none" className="max-w-full" />
      ) : inline && mime.startsWith("video/") ? (
        <video src={src} controls preload="none" className="max-h-72 max-w-full rounded-xl" />
      ) : (
        <a href={src} className="flex items-center gap-2 underline underline-offset-2">
          <Download className="size-4 shrink-0" aria-hidden />
          <span className="break-all">{m.mediaName ?? previewOf(m.kind, null)}</span>
        </a>
      )}
      {m.body ? <p className="mt-1.5 break-words whitespace-pre-line">{m.body}</p> : null}
    </>
  );
}

function composerOrders(thread: Thread, settings: Settings): ComposerOrder[] {
  return thread.orders.map((o) => ({
    id: o.id,
    item: o.itemName,
    // Before a quote is accepted nothing is owed yet: use the quote's total.
    amount: formatMyr(o.owedSen > 0 ? o.owedSen : (o.quoteSen ?? 0)),
    tracking: o.trackingNumber ?? "",
    pickupWindow: o.pickupStartsAt
      ? `${fmtDate(o.pickupStartsAt, "EEE d MMM, h:mm a")}${o.pickupEndsAt ? `–${fmtDate(o.pickupEndsAt, "h:mm a")}` : ""}`
      : settings.pickup.windowText,
  }));
}
