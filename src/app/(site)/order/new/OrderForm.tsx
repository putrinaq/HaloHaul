"use client";

import { Camera, Check, Link2, MessageCircleQuestion, Monitor } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  get,
  useForm,
  useWatch,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormRegister,
} from "react-hook-form";
import { CategoryFields } from "@/components/category/CategoryFields";
import { FieldError } from "@/components/form/FieldError";
import { PhotoUploader } from "@/components/order/PhotoUploader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { findCategory, type Catalog } from "@/domain/catalog";
import { hasMeasurements, prefillMeasurements, resolveFields, type SavedMeasurements } from "@/domain/categorySchema";
import type { BatchShippingMode, ConditionPreference, PathType, ShippingMode } from "@/domain/enums";
import { upfrontFee, coordinationFeeSen, deliveryFeeSen } from "@/domain/fees";
import { PLATFORM_LABELS } from "@/domain/labels";
import { contentPostNotice, routeForLink, validateProductLink } from "@/domain/links";
import { parseFxRate } from "@/domain/money";
import { MAX_REFERENCE_PHOTOS, validateOrderInput, type OrderFormInput } from "@/domain/orderInput";
import type { Settings } from "@/domain/settings";
import { shippingOptions } from "@/domain/shippingOptions";
import { fmtDate, fmtDays, formatMyr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { submitOrderAction } from "./actions";

export interface OrderFormProps {
  initial: Partial<OrderFormInput>;
  settings: Settings;
  /** Published categories + measurement library, from the server. */
  catalog: Catalog;
  /** Presigned URLs for "how to measure" images, by image key. */
  helpImageUrls: Record<string, string>;
  nextCutoffs: Partial<Record<BatchShippingMode, string>>;
  savedMeasurements: SavedMeasurements;
  uploadsEnabled: boolean;
  nowMs: number;
  prefillNote: string | null;
}

const PATHS: Array<{ value: PathType; title: string; body: string; icon: typeof Link2 }> = [
  { value: "url", title: "I have a link", body: "A product page on a supported platform.", icon: Link2 },
  { value: "reverse_search", title: "I have a photo", body: "A screenshot or a RedNote/Douyin post. We find it.", icon: Camera },
  { value: "digital", title: "A digital product", body: "Software, subscriptions, in-game credits.", icon: Monitor },
  { value: "consultation", title: "I'm not sure", body: "Tell us what you need and your budget.", icon: MessageCircleQuestion },
];

const CONDITIONS: Array<{ value: ConditionPreference; label: string }> = [
  { value: "new_only", label: "New only" },
  { value: "secondhand_ok", label: "Secondhand is fine" },
  { value: "either", label: "Either — whatever's best value" },
];

const STEPS = ["Start", "Item", "Details", "Delivery", "Review"] as const;

/** Which form fields live on which step (for per-step validation and error navigation). */
function stepOf(path: string, pathType: PathType | undefined): number {
  const top = path.split(".")[0];
  if (top === "pathType") return 0;
  if (["productUrl", "itemName", "quantity", "referencePhotoKeys", "conditionPreference", "domesticFreeShipping"].includes(top)) return 1;
  if (top === "remarks") return pathType === "consultation" ? 1 : 2;
  if (["category", "details", "variantText", "saveMeasurements"].includes(top)) return 2;
  if (["shippingMode", "fulfilment"].includes(top)) return 3;
  return 4;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let node = target;
  for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>;
  node[parts.at(-1)!] = value;
}

/** React Hook Form resolver backed by the shared domain validator (the server runs the same). */
function makeResolver(catalog: Catalog): Resolver<OrderFormInput> {
  return async (values) => {
    const r = validateOrderInput(values, catalog);
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const [path, message] of Object.entries(r.fieldErrors)) setPath(errors, path, { type: "validate", message });
    return { values: {}, errors: errors as FieldErrors<OrderFormInput> };
  };
}

/** Saved measurements for this category's measurement fields. */
function prefillFor(catalog: Catalog, key: string | undefined, saved: SavedMeasurements): Record<string, unknown> {
  const c = findCategory(catalog, key);
  return c ? prefillMeasurements(c.definition, saved) : {};
}

export function OrderForm(props: OrderFormProps) {
  const { settings, catalog, savedMeasurements, uploadsEnabled, nowMs } = props;
  const resolver = useMemo(() => makeResolver(catalog), [catalog]);
  const router = useRouter();
  const [step, setStep] = useState(props.initial.productUrl || props.initial.pathType ? 1 : 0);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const form = useForm<OrderFormInput>({
    resolver,
    mode: "onTouched",
    defaultValues: {
      pathType: "url",
      productUrl: "",
      itemName: "",
      quantity: 1,
      category: "",
      variantText: "",
      conditionPreference: null,
      fulfilment: "campus_pickup",
      domesticFreeShipping: false,
      remarks: "",
      referencePhotoKeys: [],
      saveMeasurements: true,
      acceptTerms: false,
      ...props.initial,
      details: prefillFor(catalog, props.initial.category, savedMeasurements),
      contact: { displayName: "", phone: "", campus: "", ...props.initial.contact },
    },
  });
  const { register, setValue, trigger, formState, control } = form;
  const errors = formState.errors;
  const reg = register as unknown as UseFormRegister<FieldValues>;
  const err = (name: string) => get(errors, name)?.message as string | undefined;

  const [pathType, productUrl, categoryKey, quantity, shippingMode, fulfilment, photos, freeShip, details] = useWatch({
    control,
    name: ["pathType", "productUrl", "category", "quantity", "shippingMode", "fulfilment", "referencePhotoKeys", "domesticFreeShipping", "details"],
  });

  // Live link check: platform, and RedNote/Douyin posts rerouted to photo search.
  const link = useMemo(() => (productUrl?.trim() ? validateProductLink(productUrl) : null), [productUrl]);
  const effectivePath: PathType = link?.ok ? routeForLink(pathType, link).pathType : pathType;
  const platform = link?.ok ? link.platform : "other";
  const category = useMemo(() => findCategory(catalog, categoryKey), [catalog, categoryKey]);
  const fields = useMemo(() => {
    try {
      return category ? resolveFields(category.definition, catalog.measurements) : [];
    } catch {
      return [];
    }
  }, [category, catalog.measurements]);
  const digitalCategories = catalog.categories.filter((c) => c.fulfilment === "digital");

  const options = useMemo(() => {
    if (!category) return [];
    const qty = Math.min(99, Math.max(1, Number(quantity) || 1));
    const cutoffs = Object.fromEntries(Object.entries(props.nextCutoffs).map(([m, iso]) => [m, new Date(iso!)]));
    return shippingOptions({
      platform,
      pathType: effectivePath,
      category,
      quantity: qty,
      settings,
      fxRate: parseFxRate(settings.fx.defaultMyrPerCny),
      nextCutoffs: cutoffs,
      now: new Date(nowMs),
    });
  }, [category, quantity, platform, effectivePath, settings, props.nextCutoffs, nowMs]);

  const cheapest = options.length > 1 ? Math.min(...options.map((o) => o.maxSen)) : null;
  const fastest = options.length > 1 ? Math.min(...options.map((o) => o.etaDaysMax ?? Infinity)) : null;
  const selectedOption = options.find((o) => o.mode === shippingMode);
  const fee = upfrontFee(effectivePath, settings);
  const isDigital = pathType === "digital";

  function choosePath(p: PathType) {
    setValue("pathType", p, { shouldValidate: false });
    if (p === "digital") {
      // One digital category is chosen for you; with several, pick on the Details step.
      const only = digitalCategories.length === 1 ? digitalCategories[0].key : "";
      setValue("category", only);
      setValue("details", prefillFor(catalog, only, savedMeasurements));
      setValue("shippingMode", "none");
    } else if (findCategory(catalog, categoryKey)?.fulfilment === "digital") {
      setValue("category", "");
      setValue("details", {});
      setValue("shippingMode", undefined as unknown as ShippingMode);
    }
    setStep(1);
  }

  function chooseCategory(key: string) {
    setValue("category", key, { shouldValidate: true });
    setValue("details", prefillFor(catalog, key, savedMeasurements));
    if (shippingMode && !options.some((o) => o.mode === shippingMode)) {
      setValue("shippingMode", undefined as unknown as ShippingMode);
    }
  }

  async function goNext() {
    const values = form.getValues();
    const r = validateOrderInput(values, catalog);
    const stepFields = r.ok ? [] : Object.keys(r.fieldErrors).filter((k) => stepOf(k, effectivePath) === step);
    if (stepFields.length > 0) {
      await trigger(stepFields as Parameters<typeof trigger>[0], { shouldFocus: true });
      return;
    }
    form.clearErrors();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onSubmit = form.handleSubmit(
    (values) => {
      setFormError(null);
      startSubmit(async () => {
        const res = await submitOrderAction(values);
        if (res.ok) {
          router.push(`/orders/${res.orderId}?new=1${res.restricted ? "&held=1" : ""}`);
          return;
        }
        if (res.formError) setFormError(res.formError);
        const entries = Object.entries(res.fieldErrors ?? {});
        for (const [path, message] of entries) form.setError(path as never, { type: "server", message });
        if (entries.length) setStep(Math.min(...entries.map(([k]) => stepOf(k, effectivePath))));
      });
    },
    (errs) => {
      const paths = Object.keys(errs);
      if (paths.length) setStep(Math.min(...paths.map((k) => stepOf(k, effectivePath))));
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <div>
        {/* Phones hide the per-step labels, so say where you are in words. */}
        <p className="mb-1 flex items-baseline justify-between text-sm sm:hidden" aria-hidden>
          <span className="font-medium text-foreground">{STEPS[step]}</span>
          <span className="text-muted-foreground tabular-nums">
            Step {step + 1} of {STEPS.length}
          </span>
        </p>
        <ol className="flex gap-1.5" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              {/* The bar is 4px, but the button around it is a full 44px tap target. */}
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}`}
                className="flex min-h-11 w-full flex-col justify-center text-left disabled:cursor-default sm:min-h-0"
              >
                <span
                  className={cn(
                    "block h-1 rounded-full transition-colors duration-500",
                    i <= step ? "bg-white" : "bg-white/15",
                  )}
                />
                <span
                  className={cn("mt-2 hidden text-xs sm:block", i === step ? "text-foreground" : "text-muted-foreground")}
                >
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {props.prefillNote ? (
        <p className="rounded-lg border border-white/15 bg-white/5 p-3 text-sm">{props.prefillNote}</p>
      ) : null}

      {/* ---- 0. Start ---------------------------------------------------- */}
      {step === 0 ? (
        <fieldset className="space-y-4">
          <legend className="display text-3xl">How would you like to start?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {PATHS.map((p) => {
              const Icon = p.icon;
              const pFee = upfrontFee(p.value, settings);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => choosePath(p.value)}
                  className={cn(
                    "flex gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-white/5",
                    pathType === p.value ? "border-white" : "border-white/15",
                  )}
                >
                  <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium">{p.title}</span>
                    <span className="block text-sm text-muted-foreground">{p.body}</span>
                    {pFee ? (
                      <span className="mt-1 block text-xs text-brand">
                        {formatMyr(pFee.amountSen)} fee, credited if you order
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* ---- 1. Item ----------------------------------------------------- */}
      {step === 1 ? (
        <section className="space-y-6">
          <h2 className="display text-3xl">
            {pathType === "url"
              ? "The product"
              : pathType === "reverse_search"
                ? "What you saw"
                : pathType === "digital"
                  ? "The digital product"
                  : "What you need"}
          </h2>

          {pathType === "consultation" ? (
            <Field label="What do you need? Include your budget." id="remarks" error={err("remarks")}>
              <Textarea
                id="remarks"
                rows={5}
                placeholder="e.g. A waterproof hiking jacket for Cameron Highlands, under RM150, size M."
                aria-invalid={err("remarks") ? true : undefined}
                {...register("remarks")}
              />
            </Field>
          ) : null}

          <Field
            label={
              pathType === "url"
                ? "Product link"
                : pathType === "reverse_search"
                  ? "Link to the post (RedNote, Douyin…) — optional"
                  : "Link — optional"
            }
            id="productUrl"
            error={err("productUrl")}
            hint="Paste the share text as-is — we'll find the link in it."
          >
            <Input
              id="productUrl"
              inputMode="url"
              autoComplete="off"
              placeholder="https://item.taobao.com/…"
              className="h-11"
              aria-invalid={err("productUrl") ? true : undefined}
              {...register("productUrl")}
            />
          </Field>
          {link?.ok && !err("productUrl") ? (
            <p className="-mt-4 flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" /> {PLATFORM_LABELS[link.platform]} link
            </p>
          ) : null}
          {link?.ok && pathType === "url" && effectivePath === "reverse_search" ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
              {contentPostNotice(link.platform, formatMyr(settings.fees.reverseSearchFeeSen))}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label={pathType === "consultation" ? "Short title" : "What is it?"} id="itemName" error={err("itemName")}>
              <Input
                id="itemName"
                placeholder={pathType === "digital" ? "e.g. Genshin 6480 Genesis Crystals" : "e.g. Canvas sneakers"}
                className="h-11"
                aria-invalid={err("itemName") ? true : undefined}
                {...register("itemName")}
              />
            </Field>
            <Field label="Quantity" id="quantity" error={err("quantity")}>
              <Input id="quantity" type="number" inputMode="numeric" min={1} max={99} className="h-11" {...register("quantity")} />
            </Field>
          </div>

          {effectivePath !== "url" && !isDigital ? (
            <Field
              label={effectivePath === "reverse_search" ? "Photos or screenshots" : "Photos — optional"}
              id="photos"
              error={err("referencePhotoKeys")}
            >
              <PhotoUploader
                value={photos ?? []}
                onChange={(keys) => setValue("referencePhotoKeys", keys, { shouldValidate: true })}
                max={MAX_REFERENCE_PHOTOS}
                enabled={uploadsEnabled}
                invalid={Boolean(err("referencePhotoKeys"))}
              />
            </Field>
          ) : null}

          {effectivePath === "reverse_search" || effectivePath === "consultation" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Condition</legend>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <label key={c.value} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm has-checked:border-white has-checked:bg-white/10">
                    <input type="radio" value={c.value} className="sr-only" {...register("conditionPreference")} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Secondhand items are sold as described by the seller; condition can vary.
              </p>
              <FieldError message={err("conditionPreference")} />
            </fieldset>
          ) : null}

          {!isDigital ? (
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={Boolean(freeShip)}
                onCheckedChange={(v) => setValue("domesticFreeShipping", v === true)}
                className="mt-0.5"
              />
              <span>
                The listing says free shipping (包邮)
                <span className="block text-xs text-muted-foreground">
                  That only covers delivery inside China. International shipping to Malaysia still applies.
                </span>
              </span>
            </label>
          ) : null}
        </section>
      ) : null}

      {/* ---- 2. Details -------------------------------------------------- */}
      {step === 2 ? (
        <section className="space-y-6">
          <h2 className="display text-3xl">Details</h2>
          {!isDigital || digitalCategories.length > 1 ? (
            <Field label="Category" id="category" error={err("category")}>
              <select
                id="category"
                value={categoryKey}
                onChange={(e) => chooseCategory(e.target.value)}
                aria-invalid={err("category") ? true : undefined}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base aria-invalid:border-destructive"
              >
                <option value="" disabled>
                  Choose a category…
                </option>
                {catalog.categories
                  .filter((c) => (c.fulfilment === "digital") === isDigital)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}

          {category ? (
            <>
              {category.restrictedNote ? (
                <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{category.restrictedNote}</p>
              ) : null}
              {hasMeasurements(category.definition) ? (
                <p className="text-sm text-muted-foreground">
                  We use these to check the seller&apos;s size chart for you.
                  {Object.keys(prefillMeasurements(category.definition, savedMeasurements)).length > 0
                    ? " Prefilled from your saved measurements."
                    : null}
                </p>
              ) : null}
              <CategoryFields
                fields={fields}
                register={reg}
                errors={errors}
                values={(details ?? {}) as Record<string, unknown>}
                helpImageUrls={props.helpImageUrls}
              />
              <Field
                label={
                  category.definition.option
                    ? `${category.definition.option.label}${category.definition.option.required ? "" : " — optional"}`
                    : "Option — colour, size, version (optional)"
                }
                id="variantText"
                error={err("variantText")}
                hint={category.definition.option?.helpText}
              >
                <Input
                  id="variantText"
                  className="h-11"
                  aria-invalid={err("variantText") ? true : undefined}
                  {...register("variantText")}
                />
              </Field>
              {hasMeasurements(category.definition) ? (
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    defaultChecked
                    onCheckedChange={(v) => setValue("saveMeasurements", v === true)}
                  />
                  Save these to my profile?
                </label>
              ) : null}
            </>
          ) : null}

          {pathType !== "consultation" ? (
            <Field label="Anything else? — optional" id="remarks2" error={err("remarks")}>
              <Textarea id="remarks2" rows={3} placeholder="Notes for us or the seller." {...register("remarks")} />
            </Field>
          ) : null}
        </section>
      ) : null}

      {/* ---- 3. Delivery ------------------------------------------------- */}
      {step === 3 ? (
        <section className="space-y-6">
          <h2 className="display text-3xl">Delivery</h2>
          {isDigital ? (
            <p className="text-muted-foreground">Digital products are delivered to the email you gave. No shipping.</p>
          ) : (
            <>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Shipping to Malaysia</legend>
                {options.map((o) => (
                  <label
                    key={o.mode}
                    className="flex cursor-pointer gap-3 rounded-2xl border border-white/15 p-4 has-checked:border-white has-checked:bg-white/5"
                  >
                    <input type="radio" value={o.mode} className="mt-1 accent-white" {...register("shippingMode")} />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {o.label}
                        {o.maxSen === cheapest ? <Tag>Cheapest</Tag> : null}
                        {o.etaDaysMax !== null && o.etaDaysMax === fastest ? <Tag>Fastest</Tag> : null}
                      </span>
                      <span className="mt-1 block text-sm">
                        {o.mode === "pdd_direct"
                          ? "No forwarder shipping"
                          : `Est. ${formatMyr(o.minSen)} – ${formatMyr(o.maxSen)}`}
                        {fmtDays(o.etaDaysMin, o.etaDaysMax) ? ` · ${fmtDays(o.etaDaysMin, o.etaDaysMax)} to campus` : ""}
                      </span>
                      {o.cutoffAt ? (
                        <span className="block text-xs text-muted-foreground">Next cutoff {fmtDate(o.cutoffAt)}</span>
                      ) : null}
                      {o.note ? <span className="block text-xs text-muted-foreground">{o.note}</span> : null}
                    </span>
                  </label>
                ))}
                <FieldError message={err("shippingMode")} />
                <p className="text-xs text-muted-foreground">
                  Estimates use typical weights for this category until we confirm with the seller. You pay the top of
                  the range; after the warehouse weigh-in, anything less is credited to your HaloHaul balance.
                </p>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Hand-over</legend>
                {(["campus_pickup", "lalamove"] as const).map((m) => (
                  <label
                    key={m}
                    className="flex cursor-pointer gap-3 rounded-2xl border border-white/15 p-4 has-checked:border-white has-checked:bg-white/5"
                  >
                    <input type="radio" value={m} className="mt-1 accent-white" {...register("fulfilment")} />
                    <span>
                      <span className="block font-medium">
                        {m === "campus_pickup" ? settings.pickup.pointName : `Lalamove delivery (+${formatMyr(deliveryFeeSen("lalamove", settings))})`}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {m === "campus_pickup" ? settings.pickup.windowText : "Delivered to you once your batch arrives."}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </section>
      ) : null}

      {/* ---- 4. Review --------------------------------------------------- */}
      {step === 4 ? (
        <section className="space-y-6">
          <h2 className="display text-3xl">Review & submit</h2>

          <div className="space-y-2 rounded-2xl bg-card p-5 text-sm">
            <h3 className="font-medium">What you&apos;ll pay</h3>
            <ul className="space-y-1.5 text-muted-foreground">
              {fee ? (
                <li>
                  <strong className="text-foreground">{formatMyr(fee.amountSen)}</strong>{" "}
                  {effectivePath === "consultation" ? "consultation" : "photo-search"} fee before we start — kept if
                  you don&apos;t buy anything, credited toward your order if you do.
                </li>
              ) : null}
              <li>
                Item price at cost, shown in RMB and ringgit on your quote.
              </li>
              <li>
                <strong className="text-foreground">{formatMyr(coordinationFeeSen(settings))}</strong> coordination fee
                for this order.
              </li>
              {selectedOption && selectedOption.maxSen > 0 ? (
                <li>
                  Shipping estimate <strong className="text-foreground">{formatMyr(selectedOption.minSen)} – {formatMyr(selectedOption.maxSen)}</strong>.
                  We collect the top of the range; after the weigh-in, anything less is credited back. If it&apos;s
                  heavier, the extra is capped at +{settings.shipping.overRangeCapPct}%.
                </li>
              ) : null}
              {shippingMode === "pdd_direct" ? <li>Delivery time set by PDD.</li> : null}
              {fulfilment === "lalamove" && !isDigital ? (
                <li>
                  <strong className="text-foreground">{formatMyr(deliveryFeeSen("lalamove", settings))}</strong> Lalamove delivery.
                </li>
              ) : null}
              {freeShip ? <li>Free shipping (包邮) on this listing covers China only.</li> : null}
            </ul>
            <p className="pt-1 text-xs text-muted-foreground">
              Nothing is charged now. We&apos;ll send a quote with every line separate; you approve it before we buy.
            </p>
          </div>

          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-medium">Your contact details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" id="contact.displayName" error={err("contact.displayName")}>
                <Input id="contact.displayName" autoComplete="name" className="h-11" {...register("contact.displayName")} />
              </Field>
              <Field label="WhatsApp number" id="contact.phone" error={err("contact.phone")}>
                <Input
                  id="contact.phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="012-345 6789"
                  className="h-11"
                  {...register("contact.phone")}
                />
              </Field>
              <Field label="Campus — optional" id="contact.campus" error={err("contact.campus")}>
                <Input id="contact.campus" className="h-11" {...register("contact.campus")} />
              </Field>
            </div>
          </fieldset>

          <div className="space-y-1">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                className="mt-0.5"
                onCheckedChange={(v) => setValue("acceptTerms", v === true, { shouldValidate: true })}
              />
              <span>
                I&apos;ve read the{" "}
                <Link href="/terms" target="_blank" className="underline">
                  terms and privacy notice
                </Link>
                : free cancellation until we buy the item, shipping is an estimate until the weigh-in, and restricted
                items may be refused.
              </span>
            </label>
            <FieldError message={err("acceptTerms")} />
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ---- navigation -------------------------------------------------- */}
      {step > 0 ? (
        <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-white/10 bg-black/90 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">

          <Button type="button" variant="outline" size="lg" className="h-12 flex-1" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" size="lg" className="h-12 flex-2" onClick={goNext}>
              Continue
            </Button>
          ) : (
            <Button type="submit" size="lg" className="h-12 flex-2" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          )}
        </div>
      ) : null}
    </form>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError message={error} />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-normal">{children}</span>;
}
