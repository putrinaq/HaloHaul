import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { isActionFilter } from "@/domain/adminQueue";
import { actionBoardPage } from "@/server/data/admin";
import { requireAdmin } from "@/server/session";
import { ActionBoard } from "./ActionBoard";

// The layout's title template only reaches child segments, not this page beside it.
export const metadata: Metadata = { title: { absolute: "Actions · HaloHaul Admin" } };

export default function ActionsPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <h1 className="display text-5xl sm:text-6xl">Need Action</h1>
      <p className="mt-1 text-sm text-white/55">Oldest first: clear the top of the list before the bottom.</p>
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function loadBoard(filter: Parameters<typeof actionBoardPage>[1], page: number) {
  await requireAdmin();
  // One clock for the whole board, so every card's "waiting" label agrees.
  const now = Date.now();
  return { board: await actionBoardPage(getDb(), filter, page, new Date(now)), now };
}

async function Board({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const sp = await searchParams;
  const filter = isActionFilter(sp.filter) ? sp.filter : "all";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const { board, now } = await loadBoard(filter, page);
  return <ActionBoard board={board} filter={filter} now={now} />;
}

function BoardSkeleton() {
  return (
    <div className="mt-6 animate-pulse" aria-busy="true">
      <div className="h-8 w-80 max-w-full rounded-lg bg-white/5" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-8 w-28 rounded-full bg-white/5" />
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-60 rounded-2xl bg-white/5" />
        ))}
      </div>
      <span className="sr-only">Loading orders…</span>
    </div>
  );
}
