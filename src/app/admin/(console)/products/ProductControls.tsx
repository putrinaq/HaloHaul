"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { deleteProductAction, productFromOrderAction, publishProductAction, saveProductAction } from "@/app/admin/_actions/customers";
import { ErrorNote, MoneyInput, minorToInput, parseMinor, useAction } from "@/components/admin/dialogs/shared";
import { ImagesInput, type UploadedImage } from "@/components/admin/ImagesInput";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Field } from "@/components/admin/ui";
import { PLATFORMS, SHIPPING_MODES, type Platform, type ShippingMode } from "@/domain/enums";
import { PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";

export interface ProductValue {
  id: string | null;
  title: string;
  variant: string | null;
  platform: Platform;
  shippingMode: ShippingMode;
  productUrl: string | null;
  category: string | null;
  retailPriceSen: number;
  halohaulPriceSen: number;
  photoKey: string | null;
  photoUrl: string | null;
  retailCheckedAt: string | null;
  isPublished: boolean;
  sortOrder: number;
  sourceOrderId: number | null;
}

const blank: ProductValue = {
  id: null,
  title: "",
  variant: null,
  platform: "taobao",
  shippingMode: "air",
  productUrl: null,
  category: null,
  retailPriceSen: 0,
  halohaulPriceSen: 0,
  photoKey: null,
  photoUrl: null,
  retailCheckedAt: new Date().toISOString().slice(0, 10),
  isPublished: false,
  sortOrder: 0,
  sourceOrderId: null,
};

function useDone() {
  const router = useRouter();
  const toast = useToast();
  return (m?: string) => {
    toast(m ?? "Saved");
    router.refresh();
  };
}

export function NewProductButtons({ completedOrders, categories }: { completedOrders: Array<{ id: number; itemName: string }>; categories: Array<{ key: string; name: string }> }) {
  const [value, setValue] = useState<ProductValue | null>(null);
  const [picking, setPicking] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="admin-btn-secondary" disabled={completedOrders.length === 0} onClick={() => setPicking(true)}>
        Create from order
      </button>
      <button type="button" className="admin-btn-primary" onClick={() => setValue(blank)}>
        <Plus className="size-4" aria-hidden />
        New card
      </button>
      <Sheet open={picking} onOpenChange={setPicking} title="Create from a completed order" description="Prefills the card; add a photo and the retail price.">
        <ul className="space-y-2">
          {completedOrders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={pending}
                className="admin-card w-full p-3 text-left text-sm hover:border-white/25"
                onClick={() =>
                  run(
                    () => productFromOrderAction({ orderId: o.id }),
                    (d) => {
                      setPicking(false);
                      setValue({ ...blank, ...d });
                    },
                  )
                }
              >
                #{o.id} {o.itemName}
              </button>
            </li>
          ))}
        </ul>
        <ErrorNote message={error} className="mt-3" />
      </Sheet>
      {value ? <ProductSheet value={value} categories={categories} onClose={() => setValue(null)} /> : null}
    </>
  );
}

export function EditProductButton({ value, categories }: { value: ProductValue; categories: Array<{ key: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="admin-btn-secondary h-9 sm:h-9" onClick={() => setOpen(true)}>
        Edit
      </button>
      {open ? <ProductSheet value={value} categories={categories} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const done = useDone();
  const { pending, error, run } = useAction();
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          disabled={pending}
          onChange={(e) => run(() => publishProductAction({ id, published: e.target.checked }), (_, m) => done(m))}
          className="size-5 accent-sky-500"
        />
        Published
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ProductSheet({ value, categories, onClose }: { value: ProductValue; categories: Array<{ key: string; name: string }>; onClose: () => void }) {
  const id = useId();
  const done = useDone();
  const [v, setV] = useState({ ...value, retail: minorToInput(value.retailPriceSen), halohaul: minorToInput(value.halohaulPriceSen) });
  const [photo, setPhoto] = useState<UploadedImage[]>(value.photoKey && value.photoUrl ? [{ key: value.photoKey, url: value.photoUrl }] : []);
  const { pending, error, fieldErrors, run } = useAction();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={value.id ? "Edit card" : "New showcase card"} description="Shown on the home page and catalogue when published." size="lg">
      <div className="space-y-4">
        <Field label="Photo" htmlFor={`${id}-ph`} error={fieldErrors.photoKey}>
          <ImagesInput value={photo} onChange={setPhoto} purpose="product" max={1} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor={`${id}-t`} error={fieldErrors.title}>
            <input id={`${id}-t`} value={v.title} onChange={(e) => set("title", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Variant — optional" htmlFor={`${id}-v`}>
            <input id={`${id}-v`} value={v.variant ?? ""} onChange={(e) => set("variant", e.target.value || null)} className="admin-input" />
          </Field>
          <Field label="Platform" htmlFor={`${id}-p`}>
            <select id={`${id}-p`} value={v.platform} onChange={(e) => set("platform", e.target.value as Platform)} className="admin-input">
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shipping" htmlFor={`${id}-s`}>
            <select id={`${id}-s`} value={v.shippingMode} onChange={(e) => set("shippingMode", e.target.value as ShippingMode)} className="admin-input">
              {SHIPPING_MODES.map((m) => (
                <option key={m} value={m}>
                  {SHIPPING_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category — optional" htmlFor={`${id}-c`} hint="Prefills the order form's category.">
            <select id={`${id}-c`} value={v.category ?? ""} onChange={(e) => set("category", e.target.value || null)} className="admin-input">
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Listing link — optional" htmlFor={`${id}-u`} error={fieldErrors.productUrl}>
            <input id={`${id}-u`} type="url" value={v.productUrl ?? ""} onChange={(e) => set("productUrl", e.target.value || null)} className="admin-input" />
          </Field>
          <Field label="Retail price" htmlFor={`${id}-r`}>
            <MoneyInput id={`${id}-r`} currency="RM" value={v.retail} onChange={(x) => set("retail", x)} />
          </Field>
          <Field label="HaloHaul price" htmlFor={`${id}-h`}>
            <MoneyInput id={`${id}-h`} currency="RM" value={v.halohaul} onChange={(x) => set("halohaul", x)} />
          </Field>
          <Field label="Retail price checked on" htmlFor={`${id}-d`} hint="Warned after 60 days.">
            <input id={`${id}-d`} type="date" value={v.retailCheckedAt ?? ""} onChange={(e) => set("retailCheckedAt", e.target.value || null)} className="admin-input" />
          </Field>
          <Field label="Sort order" htmlFor={`${id}-o`} hint="Lower shows first.">
            <input id={`${id}-o`} inputMode="numeric" value={String(v.sortOrder)} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} className="admin-input" />
          </Field>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={v.isPublished} onChange={(e) => set("isPublished", e.target.checked)} className="size-5 accent-sky-500" />
          Published
        </label>
        <ErrorNote message={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {value.id ? (
            <button type="button" className="admin-btn-danger" disabled={pending} onClick={() => confirm("Delete this card?") && run(() => deleteProductAction({ id: value.id }), (_, m) => (onClose(), done(m)))}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="admin-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    saveProductAction({
                      id: value.id,
                      title: v.title,
                      variant: v.variant,
                      platform: v.platform,
                      shippingMode: v.shippingMode,
                      productUrl: v.productUrl,
                      category: v.category,
                      retailPriceSen: parseMinor(v.retail) ?? 0,
                      halohaulPriceSen: parseMinor(v.halohaul) ?? 0,
                      photoKey: photo[0]?.key ?? null,
                      retailCheckedAt: v.retailCheckedAt,
                      isPublished: v.isPublished,
                      sortOrder: v.sortOrder,
                      sourceOrderId: v.sourceOrderId,
                    }),
                  (_, m) => (onClose(), done(m)),
                )
              }
            >
              Save card
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
