"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, type ReactNode } from "react";
import { markReadAction } from "@/app/admin/_actions/whatsapp";

const POLL_MS = 4000;

/** Reloads the inbox when something new arrives. Quiet while the tab is hidden. */
export function LiveInbox({ version }: { version: string }) {
  const router = useRouter();
  const seen = useRef(version);
  useEffect(() => {
    seen.current = version;
  }, [version]);

  const check = useEffectEvent(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch("/api/admin/whatsapp/version", { cache: "no-store" });
      if (!r.ok) return;
      const { version: latest } = (await r.json()) as { version: string };
      if (latest !== seen.current) {
        seen.current = latest;
        router.refresh();
      }
    } catch {
      // Offline for a moment: the next check will catch up.
    }
  });

  useEffect(() => {
    const id = setInterval(() => void check(), POLL_MS);
    const onShow = () => void check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
  return null;
}

/** Marks the open chat as read (again, if more arrives while it's open). */
export function MarkRead({ chatId, unread }: { chatId: string; unread: number }) {
  const router = useRouter();
  const mark = useEffectEvent(async () => {
    if (document.hidden) return;
    const r = await markReadAction({ chatId }).catch(() => null);
    if (r?.ok) router.refresh();
  });
  useEffect(() => {
    void mark();
    const onShow = () => void mark();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [chatId, unread]);
  return null;
}

/** The message list: opens at the newest, and follows new ones unless you've scrolled up to read. */
export function ThreadScroll({ marker, children }: { marker: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [marker]);
  return (
    <div
      ref={ref}
      data-lenis-prevent
      tabIndex={0}
      role="log"
      aria-label="Messages"
      onScroll={(e) => {
        const el = e.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      // Photos load after the first scroll to the bottom and push it down.
      onLoadCapture={(e) => {
        if (following.current) e.currentTarget.scrollTop = e.currentTarget.scrollHeight;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
    </div>
  );
}
