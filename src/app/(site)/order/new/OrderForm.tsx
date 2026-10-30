"use client";

import { Camera, Check, Link2, MessageCircleQuestion, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  get,
  useForm,
  useWatch,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormRegister,
} from "react-hook-form";
import { CategoryCombobox } from "@/components/category/CategoryCombobox";
import { loadCategoryDetail, prefetchCategoryDetail, useCategoryDetail, useCategoryList } from "@/components/category/categoryApiClient";
import { CategoryFields } from "@/components/category/CategoryFields";
import { FieldError } from "@/components/form/FieldError";
import { PhotoUploader } from "@/components/order/PhotoUploader";
import { Price } from "@/components/site/Price";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { findCategory, type Catalog } from "@/domain/catalog";
import type { CategoryDetailResponse } from "@/domain/categoryApi";
import { hasMeasurements, prefillMeasurements, type SavedMeasurements } from "@/domain/categorySchema";
import type { BatchShippingMode, ConditionPreference, PathType, ShippingMode, StudentPathType } from "@/domain/enums";
import { coordinationFeeDisplay, deliveryFeeSen, upfrontFee } from "@/domain/fees";
import { PLATFORM_LABELS } from "@/domain/labels";
import { contentPostNotice, routeForLink, validateProductLink } from "@/domain/links";
import { parseFxRate } from "@/domain/money";
import { MAX_REFERENCE_PHOTOS, validateOrderInput, type OrderFormInput } from "@/domain/orderInput";
import type { Settings } from "@/domain/settings";
import { shippingOptions } from "@/domain/shippingOptions";
import { fmtDate, fmtDays, formatMyr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveDraftAction } from "../../cart/actions";
import { submitOrderAction } from "./actions";

export interface OrderFormProps {
  initial: Partial<OrderFormInput>;
  settings: Settings;
  nextCutoffs: Partial<Record<BatchShippingMode, string>>;
  savedMeasurements: SavedMeasurements;
  uploadsEnabled: boolean;
  nowMs: number;
  prefillNote: string | null;
  /** The cart item this form was opened from, if any. */
  draftId: string | null;
}

const PATHS: Array<{ value: StudentPathType; title: string; body: string; icon: typeof Link2 }> = [
  { value: "url", title: "I have a link", body: "A product page on a supported platform.", icon: Link2 },
  { value: "reverse_search", title: "I have a photo", body: "A screenshot or a RedNote/Douyin post. We find it.", icon: Camera },
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

/** No category form loaded yet. */
const EMPTY_CATALOG: Catalog = { categories: [], measurements: [] };

/** The chosen category's form (from GET /api/categories/[key]) as a one-category catalogue. */
function catalogOf(detail: CategoryDetailResponse | null): Catalog {
  return detail ? { categories: [detail.category], measurements: detail.measurements } : EMPTY_CATALOG;
}

/**
 * React Hook Form resolver backed by the shared domain validator (the server
 * runs the same). It reads the catalogue at validation time, because the
 * chosen category's form arrives from the API after the first render.
 */
function makeResolver(getCatalog: () => Catalog): Resolver<OrderFormInput> {
  return async (values) => {
    const r = validateOrderInput(values, getCatalog());
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const [path, message] of Object.entries(r.fieldErrors)) setPath(errors, path, { type: "validate", message });
    return { values: {}, errors: errors as FieldErrors<OrderFormInput> };
  };
}

export function OrderForm(props: OrderFormProps) {
  const { settings, savedMeasurements, uploadsEnabled, nowMs } = props;
  const catalogRef = useRef(EMPTY_CATALOG);
  const resolver = useMemo(() => makeResolver(() => catalogRef.current), []);
  const router = useRouter();
  const [step, setStep] = useState(props.initial.productUrl || props.initial.pathType ? 1 : 0);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [savingDraft, startSavingDraft] = useTransition();

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
      // A cart item keeps what was typed; saved measurements only fill the gaps.
      details: props.initial.details ?? {},
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

  // Categories come from the API: the list for the search box, then the
  // chosen category's form (fields, measurement limits, help pictures).
  const categoryList = useCategoryList();
  const categoryForm = useCategoryDetail(categoryKey ?? "");
  const catalog = useMemo(() => catalogOf(categoryForm.data), [categoryForm.data]);
  useLayoutEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);
  const category = findCategory(catalog, categoryKey);
  const fields = categoryForm.data?.fields ?? [];
  const categoryLoading = Boolean(categoryKey) && categoryForm.status === "loading";

  // A category chosen before the form opened (a showcase card, ?category=): prefill it once it loads.
  const initialCategory = useRef(props.initial.category ?? "");
  useEffect(() => {
    const key = initialCategory.current;
    initialCategory.current = "";
    if (key) void prefillMeasurementsFor(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

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
  const coordination = coordinationFeeDisplay(settings);

  function choosePath(p: StudentPathType) {
    setValue("pathType", p, { shouldValidate: false });
    setStep(1);
  }

  /** Fill the measurement fields from the student's profile once the category's form has loaded. */
  async function prefillMeasurementsFor(key: string) {
    try {
      const detail = await loadCategoryDetail(key);
      // Ignore a slow answer for a category the student has since changed.
      if (form.getValues("category") === key) {
        setValue("details", { ...prefillMeasurements(detail.definition, savedMeasurements), ...form.getValues("details") });
      }
    } catch {
      // The details step shows the load error and a retry.
    }
  }

  function chooseCategory(key: string) {
    if (key === categoryKey) return;
    // No validation yet: the category's form is still on its way, and checking
    // against nothing would flag a perfectly good choice. Continue checks it.
    setValue("category", key);
    setValue("details", {});
    form.clearErrors(["category", "details", "variantText"]);
    const allowed = categoryList.data?.find((c) => c.key === key)?.allowedShippingModes;
    if (shippingMode && allowed && !allowed.includes(shippingMode)) {
      setValue("shippingMode", undefined as unknown as ShippingMode);
    }
    void prefillMeasurementsFor(key);
  }

  async function goNext() {
    // The details step can't be checked until the category's form is here.
    if (step === 2 && categoryLoading) return;
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

  /** "Add to cart": keep this order as it is to finish or submit later. Nothing is checked yet. */
  function addToCart() {
    setFormError(null);
    startSavingDraft(async () => {
      const res = await saveDraftAction({ id: props.draftId, values: form.getValues() });
      if (res.ok) router.push(`/cart?added=${res.id}`);
      else setFormError(res.error);
    });
  }

  const onSubmit = form.handleSubmit(
    (values) => {
      setFormError(null);
      startSubmit(async () => {
        const res = await submitOrderAction(values, props.draftId);
        if (res.ok) {
          router.push(`/orders/${res.orderId}?new=1${res.restricted ? "&held=1" : ""}`);
          return;
        }
        if (res.formError) setFormError(res.formError);
        const entries = Object.entries(res.fieldErrors ?? {});
        // The server checked against a newer version of this category's form than
        // the one on screen (the admin published meanwhile): load the new one.
        const known = new Set(fields.map((f) => `details.${f.key}`));
        if (entries.some(([k]) => k.startsWith("details.") && !known.has(k))) {
          categoryForm.refresh();
          setFormError("The form for this category was just updated. Please check the Details step again.");
        }
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
                placeholder="e.g. Canvas sneakers"
                className="h-11"
                aria-invalid={err("itemName") ? true : undefined}
                {...register("itemName")}
              />
            </Field>
            <Field label="Quantity" id="quantity" error={err("quantity")}>
              <Input id="quantity" type="number" inputMode="numeric" min={1} max={99} className="h-11" {...register("quantity")} />
            </Field>
          </div>

          {effectivePath !== "url" ? (
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
        </section>
      ) : null}

      {/* ---- 2. Details -------------------------------------------------- */}
      {step === 2 ? (
        <section className="space-y-6">
          <h2 className="display text-3xl">Details</h2>
          <Field label="Category" id="category" error={err("category")}>
            <CategoryCombobox
              id="category"
              value={categoryKey ?? ""}
              onChange={chooseCategory}
              categories={categoryList.data}
              loading={categoryList.status === "loading"}
              error={categoryList.error}
              onRetry={categoryList.retry}
              invalid={Boolean(err("category"))}
              fallbackKey="other"
              onHighlight={prefetchCategoryDetail}
            />
          </Field>

          {categoryLoading ? (
            <div aria-busy className="space-y-4" aria-label="Loading the category's details">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                  <div className="h-11 animate-pulse rounded-lg bg-white/5" />
                </div>
              ))}
            </div>
          ) : null}

          {categoryKey && categoryForm.status === "error" ? (
            <p className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {categoryForm.error}
              <button type="button" onClick={categoryForm.retry} className="text-foreground underline underline-offset-2">
                Try again
              </button>
            </p>
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
                helpImageUrls={categoryForm.data?.helpImages ?? {}}
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
                <strong className="text-foreground"><Price sen={coordination.sen} wasSen={coordination.wasSen} /></strong> coordination fee
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
              {fulfilment === "lalamove" ? (
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
                  Terms &amp; Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="underline">
                  Privacy Policy
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
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-12 shrink-0 px-0 sm:w-auto sm:px-4"
            onClick={addToCart}
            disabled={savingDraft || submitting}
            aria-label={props.draftId ? "Save to cart" : "Add to cart"}
            title="Save this order to finish or submit later"
          >
            <ShoppingCart className="size-5" aria-hidden />
            <span className="hidden sm:inline">{savingDraft ? "Saving…" : props.draftId ? "Save to cart" : "Add to cart"}</span>
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" size="lg" className="h-12 flex-2" onClick={goNext} disabled={step === 2 && categoryLoading}>
              {step === 2 && categoryLoading ? "Loading the form…" : "Continue"}
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
