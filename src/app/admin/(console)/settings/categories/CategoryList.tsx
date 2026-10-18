"use client";

import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCategoryAction, reorderCategoriesAction } from "@/app/admin/_actions/settings";
import { CategoryIcon } from "@/components/admin/CategoryIcon";
import { ErrorNote, useAction } from "@/components/admin/dialogs/shared";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Badge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { blankCategory, CategoryInfoForm, type CategoryInfoValues } from "./CategoryInfoForm";

interface Row {
  id: string;
  key: string;
  name: string;
  icon: string;
  isActive: boolean;
  published: boolean;
  orderCount: number;
  draftVersion: number | null;
}

/** Categories in order-form order: drag (or use the arrows) to reorder; open one to edit its fields. */
export function CategoryList({ rows: initial }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { error, run } = useAction();

  const persist = (next: Row[]) => {
    setRows(next);
    run(() => reorderCategoriesAction({ ids: next.map((r) => r.id) }), () => toast("Order saved"));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persist(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-white/55">Each category has its own order-form fields. Edits go into a draft and only reach students when you publish.</p>
        <button type="button" className="admin-btn-primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          New category
        </button>
      </div>
      <ErrorNote message={error} />
      <ol className="admin-card divide-y divide-white/10 text-sm">
        {rows.map((r, i) => (
          <li
            key={r.id}
            draggable
            onDragStart={() => setDragging(r.id)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragging && move(rows.findIndex((x) => x.id === dragging), i)}
            className={cn("flex items-center gap-2 p-2 pr-3", dragging === r.id && "opacity-40")}
          >
            <span className="hidden cursor-grab px-1 text-white/30 sm:block" aria-hidden>
              <GripVertical className="size-4" />
            </span>
            <span className="flex flex-col">
              <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="grid size-7 place-items-center rounded text-white/50 hover:text-white disabled:opacity-20">
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} className="grid size-7 place-items-center rounded text-white/50 hover:text-white disabled:opacity-20">
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
            </span>
            <Link href={`/admin/settings/categories/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 hover:bg-white/5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                <CategoryIcon name={r.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {r.name}
                  {!r.isActive ? <Badge tone="warning">off</Badge> : null}
                  {!r.published ? <Badge tone="info">not published</Badge> : null}
                  {r.draftVersion && r.published ? <Badge>draft v{r.draftVersion}</Badge> : null}
                </span>
                <span className="block font-mono text-xs text-white/45">{r.key}</span>
              </span>
              <span className="text-xs whitespace-nowrap text-white/55 tabular-nums">
                {r.orderCount} order{r.orderCount === 1 ? "" : "s"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      {creating ? (
        <NewCategorySheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/admin/settings/categories/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function NewCategorySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [value, setValue] = useState<CategoryInfoValues>(blankCategory);
  const { pending, error, fieldErrors, run } = useAction();
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="New category" description="Starts as a draft with no fields. Add fields, then publish." size="lg">
      <CategoryInfoForm value={value} onChange={setValue} isNew fieldErrors={fieldErrors} />
      <ErrorNote message={error} className="mt-4" />
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="admin-btn-primary" disabled={pending} onClick={() => run(() => createCategoryAction(value), (d) => onCreated(d.id))}>
          Create and add fields
        </button>
      </div>
    </Sheet>
  );
}
