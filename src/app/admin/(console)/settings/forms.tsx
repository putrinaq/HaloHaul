"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { deleteRestrictedAction, saveRestrictedAction, saveSettingsAction } from "@/app/admin/_actions/settings";
import { ErrorNote, MoneyInput, minorToInput, parseMinor, useAction } from "@/components/admin/dialogs/shared";
import { ImagesInput, type UploadedImage } from "@/components/admin/ImagesInput";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Field } from "@/components/admin/ui";
import { BATCH_SHIPPING_MODES, SHIPPING_MODES, type ShippingMode } from "@/domain/enums";
import { SHIPPING_MODE_LABELS } from "@/domain/labels";
import { renderTemplate, TEMPLATE_KEYS, TEMPLATE_LABELS, TEMPLATE_VARIABLES, DEFAULT_TEMPLATES } from "@/domain/messages";
import type { Settings } from "@/domain/settings";

type Section = "fees" | "fx" | "shipping" | "pickup" | "quote" | "store" | "messages";

function useSave() {
  const router = useRouter();
  const toast = useToast();
  const action = useAction();
  const done = (message?: string) => {
    toast(message ?? "Saved");
    router.refresh();
  };
  const save = (section: Section, value: unknown, note?: string | null) =>
    action.run(() => saveSettingsAction({ section, value, note: note ?? null }), (_, m) => done(m));
  return { ...action, save, done };
}

function Card({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="admin-card p-5">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
      {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
    </section>
  );
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

// ---- fees (+ reconciliation cap and quote validity) -------------------------------------------

export function FeesForm({ settings }: { settings: Settings }) {
  const id = useId();
  const f = settings.fees;
  const [values, setValues] = useState({
    coordination: minorToInput(f.coordinationFeeSen),
    reverse: minorToInput(f.reverseSearchFeeSen),
    consultation: minorToInput(f.consultationFeeSen),
    lalamove: minorToInput(f.lalamoveFeeSen),
  });
  const [cap, setCap] = useState(String(settings.shipping.overRangeCapPct));
  const [validDays, setValidDays] = useState(String(settings.quote.validDays));
  const { pending, error, save, run, done } = useSave();
  const set = (k: keyof typeof values) => (v: string) => setValues((s) => ({ ...s, [k]: v }));

  function saveFees() {
    save("fees", {
      coordinationFeeSen: parseMinor(values.coordination),
      reverseSearchFeeSen: parseMinor(values.reverse),
      consultationFeeSen: parseMinor(values.consultation),
      lalamoveFeeSen: parseMinor(values.lalamove),
    });
  }
  function saveRules() {
    const quote = { validDays: num(validDays) };
    run(
      async () => {
        const a = await saveSettingsAction({ section: "shipping", value: { ...settings.shipping, overRangeCapPct: num(cap) } });
        return a.ok ? saveSettingsAction({ section: "quote", value: quote }) : a;
      },
      (_, m) => done(m),
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="Fees"
        footer={
          <button type="button" onClick={saveFees} disabled={pending} className="admin-btn-primary">
            Save fees
          </button>
        }
      >
        {(
          [
            ["coordination", "Coordination fee (link orders, per item)"],
            ["reverse", "Photo search fee"],
            ["consultation", "Consultation fee"],
            ["lalamove", "Lalamove delivery"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`${id}-${k}`}>
            <MoneyInput id={`${id}-${k}`} currency="RM" value={values[k]} onChange={set(k)} />
          </Field>
        ))}
      </Card>
      <Card
        title="Rules"
        footer={
          <button type="button" onClick={saveRules} disabled={pending} className="admin-btn-primary">
            Save rules
          </button>
        }
      >
        <Field label="Reconciliation cap (%)" htmlFor={`${id}-cap`} hint="Over-estimate shipping is charged up to this % above the top of the quoted range; you absorb the rest.">
          <input id={`${id}-cap`} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className="admin-input" />
        </Field>
        <Field label="Quotes stay open for (days)" htmlFor={`${id}-days`}>
          <input id={`${id}-days`} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} className="admin-input" />
        </Field>
      </Card>
      <ErrorNote message={error} className="lg:col-span-2" />
    </div>
  );
}

// ---- exchange rate ------------------------------------------------------------------------------

export function FxForm({ settings }: { settings: Settings }) {
  const id = useId();
  const [rate, setRate] = useState(String(Number(settings.fx.defaultMyrPerCny)));
  const [note, setNote] = useState("");
  const { pending, error, save } = useSave();
  return (
    <Card
      title="Current rate"
      footer={
        <button type="button" disabled={pending} onClick={() => save("fx", { defaultMyrPerCny: rate.trim() }, note)} className="admin-btn-primary">
          Save rate
        </button>
      }
    >
      <Field label="MYR per ¥1" htmlFor={`${id}-r`} hint="New quotes start from this rate; each quote keeps the rate it was sent with.">
        <input id={`${id}-r`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="admin-input tabular-nums" />
      </Field>
      <Field label="Note — optional" htmlFor={`${id}-n`} hint="e.g. where the rate came from.">
        <input id={`${id}-n`} value={note} onChange={(e) => setNote(e.target.value)} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
    </Card>
  );
}

// ---- pickup -------------------------------------------------------------------------------------

export function PickupForm({ settings }: { settings: Settings }) {
  const id = useId();
  const [v, setV] = useState(settings.pickup);
  const { pending, error, save } = useSave();
  return (
    <Card
      title="Campus pickup"
      footer={
        <button type="button" disabled={pending} onClick={() => save("pickup", v)} className="admin-btn-primary">
          Save
        </button>
      }
    >
      <Field label="Pickup point" htmlFor={`${id}-p`} hint="A public spot on campus — never a home address.">
        <input id={`${id}-p`} value={v.pointName} onChange={(e) => setV({ ...v, pointName: e.target.value })} className="admin-input" />
      </Field>
      <Field label="Directions — optional" htmlFor={`${id}-n`}>
        <textarea id={`${id}-n`} rows={2} value={v.pointNote} onChange={(e) => setV({ ...v, pointNote: e.target.value })} className="admin-input" />
      </Field>
      <Field label="Usual window" htmlFor={`${id}-w`} hint="Shown on the site; each batch sets its exact pickup window.">
        <input id={`${id}-w`} value={v.windowText} onChange={(e) => setV({ ...v, windowText: e.target.value })} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
    </Card>
  );
}

// ---- message templates ----------------------------------------------------------------------------

const SAMPLE = { name: "Aina", order: "#1042", item: "Linen shirt", amount: "RM 86.40", pickup_point: "Library foyer", pickup_window: "Thu 6–8 pm", tracking: "SF1234567" };

export function MessagesForm({ settings }: { settings: Settings }) {
  const id = useId();
  const [v, setV] = useState(() => Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, settings.messages[k] || DEFAULT_TEMPLATES[k]])) as Record<(typeof TEMPLATE_KEYS)[number], string>);
  const { pending, error, save } = useSave();
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        Variables: {TEMPLATE_VARIABLES.map((x) => `{{${x}}}`).join(" ")}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_KEYS.map((k) => (
          <section key={k} className="admin-card space-y-3 p-4">
            <label htmlFor={`${id}-${k}`} className="font-medium">
              {TEMPLATE_LABELS[k]}
            </label>
            <textarea id={`${id}-${k}`} rows={4} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="admin-input" />
            <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-100/90">{renderTemplate(v[k], SAMPLE)}</p>
          </section>
        ))}
      </div>
      <ErrorNote message={error} />
      <div className="flex justify-end">
        <button type="button" disabled={pending} onClick={() => save("messages", v)} className="admin-btn-primary">
          Save templates
        </button>
      </div>
    </div>
  );
}

// ---- store ---------------------------------------------------------------------------------------

export function StoreForm({ settings, qr }: { settings: Settings; qr: UploadedImage | null }) {
  const id = useId();
  const [v, setV] = useState(settings.store);
  const [image, setImage] = useState<UploadedImage[]>(qr ? [qr] : []);
  const { pending, error, save } = useSave();
  return (
    <Card
      title="Store"
      footer={
        <button type="button" disabled={pending} onClick={() => save("store", { ...v, duitnowQrKey: image[0]?.key ?? null })} className="admin-btn-primary">
          Save
        </button>
      }
    >
      <Field label="DuitNow QR" htmlFor={`${id}-qr`} hint="Students scan this to pay. Upload a clear screenshot.">
        <ImagesInput value={image} onChange={setImage} purpose="store" max={1} label="Upload QR" />
      </Field>
      <Field label="Payment note (shown under the QR)" htmlFor={`${id}-pn`}>
        <textarea id={`${id}-pn`} rows={2} value={v.paymentNote} onChange={(e) => setV({ ...v, paymentNote: e.target.value })} className="admin-input" />
      </Field>
      <Field label="Business name" htmlFor={`${id}-bn`}>
        <input id={`${id}-bn`} value={v.businessName} onChange={(e) => setV({ ...v, businessName: e.target.value })} className="admin-input" />
      </Field>
      <Field label="Business details (on receipts)" htmlFor={`${id}-bd`} hint="Registration number, address, contact.">
        <textarea id={`${id}-bd`} rows={4} value={v.businessDetails} onChange={(e) => setV({ ...v, businessDetails: e.target.value })} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
    </Card>
  );
}

// ---- shipping rates -------------------------------------------------------------------------------

type Shipping = Settings["shipping"];
type Rate = NonNullable<Shipping["forwarders"][number]["rates"]["air"]>;

export function ShippingForm({ settings }: { settings: Settings }) {
  const id = useId();
  const [ship, setShip] = useState<Shipping>(settings.shipping);
  const { pending, error, save } = useSave();

  const setRate = (fi: number, mode: (typeof BATCH_SHIPPING_MODES)[number], patch: Partial<Rate> | null) =>
    setShip((s) => {
      const forwarders = s.forwarders.map((f, i) => {
        if (i !== fi) return f;
        const rates = { ...f.rates };
        if (patch === null) delete rates[mode];
        else rates[mode] = { subsequentKgFen: 0, spreadFen: 0, minChargeSen: 0, volumetricDivisor: 6000, ...rates[mode], ...patch };
        return { ...f, rates };
      });
      return { ...s, forwarders };
    });
  const fenField = (v: number) => minorToInput(v);

  return (
    <div className="space-y-4">
      {ship.forwarders.map((f, fi) => (
        <section key={fi} className="admin-card space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Forwarder" htmlFor={`${id}-f${fi}`} className="flex-1">
              <input
                id={`${id}-f${fi}`}
                value={f.name}
                onChange={(e) => setShip((s) => ({ ...s, forwarders: s.forwarders.map((x, i) => (i === fi ? { ...x, name: e.target.value } : x)) }))}
                className="admin-input"
              />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name={`${id}-default`} checked={ship.defaultForwarder === f.name} onChange={() => setShip((s) => ({ ...s, defaultForwarder: f.name }))} className="accent-sky-500" />
              Default
            </label>
            {ship.forwarders.length > 1 ? (
              <button type="button" className="admin-btn-secondary" onClick={() => setShip((s) => ({ ...s, forwarders: s.forwarders.filter((_, i) => i !== fi) }))}>
                Remove
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-white/55">
                <tr>
                  <th className="pb-2 font-normal">Mode</th>
                  <th className="pb-2 font-normal">Per kg (¥)</th>
                  <th className="pb-2 font-normal">Spread per kg (¥)</th>
                  <th className="pb-2 font-normal">Minimum (RM)</th>
                  <th className="pb-2 font-normal">Volumetric ÷</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {BATCH_SHIPPING_MODES.map((m) => {
                  const r = f.rates[m];
                  return (
                    <tr key={m} className="border-t border-white/10">
                      <td className="py-2 pr-3">{SHIPPING_MODE_LABELS[m]}</td>
                      {r ? (
                        <>
                          <td className="py-2 pr-2">
                            <input aria-label={`${m} per kg`} inputMode="decimal" defaultValue={fenField(r.subsequentKgFen)} onBlur={(e) => setRate(fi, m, { subsequentKgFen: parseMinor(e.target.value) ?? 0 })} className="admin-input" />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label={`${m} spread`} inputMode="decimal" defaultValue={fenField(r.spreadFen)} onBlur={(e) => setRate(fi, m, { spreadFen: parseMinor(e.target.value) ?? 0 })} className="admin-input" />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label={`${m} minimum`} inputMode="decimal" defaultValue={fenField(r.minChargeSen)} onBlur={(e) => setRate(fi, m, { minChargeSen: parseMinor(e.target.value) ?? 0 })} className="admin-input" />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label={`${m} divisor`} inputMode="numeric" defaultValue={r.volumetricDivisor} onBlur={(e) => setRate(fi, m, { volumetricDivisor: Number(e.target.value) || 6000 })} className="admin-input" />
                          </td>
                          <td className="py-2">
                            <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => setRate(fi, m, null)}>
                              Not offered
                            </button>
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="py-2">
                          <button type="button" className="text-sm text-sky-300 hover:underline" onClick={() => setRate(fi, m, {})}>
                            Add a rate
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="admin-btn-secondary"
        onClick={() => setShip((s) => ({ ...s, forwarders: [...s.forwarders, { name: `forwarder-${s.forwarders.length + 1}`, rates: {} }] }))}
      >
        <Plus className="size-4" aria-hidden />
        Add forwarder
      </button>

      <section className="admin-card space-y-4 p-5">
        <h2 className="font-medium">Estimate ranges</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headroom: seller-confirmed size (%)" htmlFor={`${id}-hs`}>
            <input id={`${id}-hs`} inputMode="numeric" value={ship.rangeHeadroomPct.sellerConfirmed} onChange={(e) => setShip((s) => ({ ...s, rangeHeadroomPct: { ...s.rangeHeadroomPct, sellerConfirmed: Number(e.target.value) } }))} className="admin-input" />
          </Field>
          <Field label="Headroom: category default (%)" htmlFor={`${id}-hc`}>
            <input id={`${id}-hc`} inputMode="numeric" value={ship.rangeHeadroomPct.categoryDefault} onChange={(e) => setShip((s) => ({ ...s, rangeHeadroomPct: { ...s.rangeHeadroomPct, categoryDefault: Number(e.target.value) } }))} className="admin-input" />
          </Field>
          {(["air", "air_sensitive", "sea", "pdd_direct"] as const).map((m) => (
            <Field key={m} label={`${SHIPPING_MODE_LABELS[m]}: days to campus`} htmlFor={`${id}-t-${m}`}>
              <div className="flex items-center gap-2">
                <input
                  id={`${id}-t-${m}`}
                  inputMode="numeric"
                  aria-label="Minimum days"
                  value={ship.transitDays[m].min}
                  onChange={(e) => setShip((s) => ({ ...s, transitDays: { ...s.transitDays, [m]: { ...s.transitDays[m], min: Number(e.target.value) } } }))}
                  className="admin-input"
                />
                <span className="text-white/45">to</span>
                <input
                  inputMode="numeric"
                  aria-label="Maximum days"
                  value={ship.transitDays[m].max}
                  onChange={(e) => setShip((s) => ({ ...s, transitDays: { ...s.transitDays, [m]: { ...s.transitDays[m], max: Number(e.target.value) } } }))}
                  className="admin-input"
                />
              </div>
            </Field>
          ))}
        </div>
      </section>
      <ErrorNote message={error} />
      <div className="flex justify-end">
        <button type="button" disabled={pending} onClick={() => save("shipping", ship)} className="admin-btn-primary">
          Save shipping
        </button>
      </div>
    </div>
  );
}

// ---- restricted items ---------------------------------------------------------------------------

export interface RestrictedRow {
  id: string;
  keyword: string;
  appliesToModes: ShippingMode[];
  forwarder: string | null;
  note: string | null;
}

export function RestrictedEditor({ rows }: { rows: RestrictedRow[] }) {
  const [editing, setEditing] = useState<RestrictedRow | "new" | null>(null);
  const router = useRouter();
  const toast = useToast();
  const { run } = useAction();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" className="admin-btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add keyword
        </button>
      </div>
      <ul className="admin-card divide-y divide-white/10 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.keyword}</p>
              <p className="text-xs text-white/55">
                {r.appliesToModes.length ? r.appliesToModes.map((m) => SHIPPING_MODE_LABELS[m]).join(", ") : "Every mode"}
                {r.forwarder ? ` · ${r.forwarder} only` : ""}
              </p>
              {r.note ? <p className="mt-1 text-white/70">{r.note}</p> : null}
            </div>
            <button type="button" aria-label={`Edit ${r.keyword}`} onClick={() => setEditing(r)} className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Remove ${r.keyword}`}
              onClick={() =>
                run(
                  () => deleteRestrictedAction({ id: r.id }),
                  (_, m) => {
                    toast(m ?? "Removed");
                    router.refresh();
                  },
                )
              }
              className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {rows.length === 0 ? <li className="p-4 text-white/50">No keywords yet.</li> : null}
      </ul>
      {editing ? <RestrictedSheet row={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RestrictedSheet({ row, onClose }: { row: RestrictedRow | null; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [keyword, setKeyword] = useState(row?.keyword ?? "");
  const [modes, setModes] = useState<ShippingMode[]>(row?.appliesToModes ?? []);
  const [forwarder, setForwarder] = useState(row?.forwarder ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const { pending, error, fieldErrors, run } = useAction();
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={row ? "Edit keyword" : "Add keyword"} description="Matched against the item name, link, option, remarks and details.">
      <div className="space-y-5">
        <Field label="Keyword" htmlFor={`${id}-k`} error={fieldErrors.keyword}>
          <input id={`${id}-k`} value={keyword} onChange={(e) => setKeyword(e.target.value)} className="admin-input" placeholder="e.g. power bank, 充电宝" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-white/85">Applies to (none = every mode)</legend>
          <div className="flex flex-wrap gap-2">
            {SHIPPING_MODES.filter((m) => m !== "none").map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-3 text-sm has-checked:border-white has-checked:bg-white/10">
                <input type="checkbox" checked={modes.includes(m)} onChange={(e) => setModes((s) => (e.target.checked ? [...s, m] : s.filter((x) => x !== m)))} className="accent-sky-500" />
                {SHIPPING_MODE_LABELS[m]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Forwarder — optional" htmlFor={`${id}-f`} hint="Leave empty for every forwarder.">
          <input id={`${id}-f`} value={forwarder} onChange={(e) => setForwarder(e.target.value)} className="admin-input" />
        </Field>
        <Field label="Note" htmlFor={`${id}-n`}>
          <textarea id={`${id}-n`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="admin-input" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={pending}
            onClick={() =>
              run(
                () => saveRestrictedAction({ id: row?.id ?? null, keyword, appliesToModes: modes, forwarder: forwarder || null, note: note || null }),
                (_, m) => {
                  toast(m ?? "Saved");
                  onClose();
                  router.refresh();
                },
              )
            }
          >
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}
