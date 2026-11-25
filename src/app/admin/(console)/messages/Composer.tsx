"use client";

import { MessageCircle, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { sendTemplateAction, sendTextAction } from "@/app/admin/_actions/whatsapp";
import { ErrorNote, useAction } from "@/components/admin/dialogs/shared";
import { renderTemplate, waLink } from "@/domain/messages";
import { fillTemplate, MAX_TEXT_LENGTH, type WaTemplate } from "@/domain/whatsapp";

export interface ComposerOrder {
  id: number;
  item: string;
  amount: string;
  tracking: string;
  pickupWindow: string;
}

interface Props {
  target: { chatId: string | null; customerId: string | null };
  phone: string | null;
  firstName: string;
  /** chat: reply freely. template: past 24 hours. link: not connected, so it opens WhatsApp. */
  mode: "chat" | "template" | "link";
  orders: ComposerOrder[];
  quickReplies: Array<{ label: string; text: string }>;
  pickupPoint: string;
  /** Null when Meta couldn't be asked. */
  approved: WaTemplate[] | null;
}

export function Composer(props: Props) {
  const id = useId();
  const [orderId, setOrderId] = useState(props.orders[0]?.id ?? 0);
  const order = props.orders.find((o) => o.id === orderId);
  const vars = {
    name: props.firstName,
    order: order ? `#${order.id}` : "",
    item: order?.item ?? "",
    amount: order?.amount ?? "",
    pickup_point: props.pickupPoint,
    pickup_window: order?.pickupWindow ?? "",
    tracking: order?.tracking ?? "",
  };
  const orderSelect = props.orders.length ? (
    <>
      <label htmlFor={`${id}-o`} className="sr-only">
        Order for the template
      </label>
      <select id={`${id}-o`} value={orderId} onChange={(e) => setOrderId(Number(e.target.value))} className="admin-input min-w-0 flex-1">
        {props.orders.map((o) => (
          <option key={o.id} value={o.id}>
            #{o.id} {o.item}
          </option>
        ))}
      </select>
    </>
  ) : null;

  return (
    <div className="border-t border-white/10 p-3">
      {props.mode === "template" ? <TemplateForm {...props} vars={vars} orderSelect={orderSelect} /> : <TextForm {...props} vars={vars} orderSelect={orderSelect} />}
    </div>
  );
}

type FormProps = Props & { vars: Record<string, string>; orderSelect: React.ReactNode };

function TextForm({ target, phone, mode, quickReplies, vars, orderSelect }: FormProps) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useAction();
  const message = text.trim();

  function send(e?: FormEvent) {
    e?.preventDefault();
    if (!message || pending) return;
    if (mode === "link") {
      if (phone) window.open(waLink(phone, message), "_blank", "noopener,noreferrer");
      return;
    }
    run(
      async () => {
        const r = await sendTextAction({ ...target, id: messageId, text: message });
        // A new id either way: this attempt is on record, sent or not.
        setMessageId(crypto.randomUUID());
        if (!r.ok) router.refresh();
        return r;
      },
      ({ chatId }) => {
        setText("");
        if (target.chatId) router.refresh();
        else router.replace(`/admin/messages?chat=${chatId}`);
      },
    );
  }

  return (
    <form onSubmit={send} className="space-y-2">
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-q`} className="sr-only">
          Quick reply
        </label>
        <select
          id={`${id}-q`}
          value=""
          onChange={(e) => {
            const reply = quickReplies.find((r) => r.label === e.target.value);
            if (reply) setText(renderTemplate(reply.text, vars));
          }}
          className="admin-input min-w-0 flex-1"
        >
          <option value="">Quick reply…</option>
          {quickReplies.map((r) => (
            <option key={r.label} value={r.label}>
              {r.label}
            </option>
          ))}
        </select>
        {orderSelect}
      </div>
      <div className="flex items-end gap-2">
        <label htmlFor={`${id}-t`} className="sr-only">
          Message
        </label>
        <textarea
          id={`${id}-t`}
          rows={1}
          value={text}
          maxLength={MAX_TEXT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends with a keyboard; on phones it makes a new line, as in WhatsApp.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message"
          className="admin-input field-sizing-content max-h-40 min-h-11 flex-1 resize-none py-2.5"
        />
        <button type="submit" disabled={!message || pending || (mode === "link" && !phone)} className="admin-btn-primary shrink-0">
          {mode === "link" ? <MessageCircle className="size-4" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
          <span className={mode === "link" ? undefined : "max-sm:sr-only"}>{mode === "link" ? "Open in WhatsApp" : pending ? "Sending…" : "Send"}</span>
        </button>
      </div>
    </form>
  );
}

function TemplateForm({ target, approved, vars, orderSelect }: FormProps) {
  const router = useRouter();
  const id = useId();
  const keyOf = (t: WaTemplate) => `${t.name}/${t.language}`;
  const [key, setKey] = useState("");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useAction();
  const template = approved?.find((t) => keyOf(t) === key);
  // Blanks named like our own ({{name}}, {{order}}…) fill themselves in.
  const values = Object.fromEntries((template?.params ?? []).map((p) => [p, edited[p] ?? vars[p] ?? ""]));
  const ready = template && template.params.every((p) => values[p].trim());

  function send(e: FormEvent) {
    e.preventDefault();
    if (!template || !ready || pending) return;
    run(
      async () => {
        const r = await sendTemplateAction({ ...target, id: messageId, name: template.name, language: template.language, values });
        setMessageId(crypto.randomUUID());
        if (!r.ok) router.refresh();
        return r;
      },
      ({ chatId }) => {
        setKey("");
        setEdited({});
        if (target.chatId) router.refresh();
        else router.replace(`/admin/messages?chat=${chatId}`);
      },
    );
  }

  return (
    <form onSubmit={send} className="space-y-2">
      <p className="text-xs leading-relaxed text-white/55">
        {target.chatId ? "More than 24 hours since they last wrote, so" : "They haven't written to you yet, so"} WhatsApp only allows an approved template. Meta charges for these. Once they reply, you can write freely.
      </p>
      <ErrorNote message={error} />
      {approved === null ? (
        <p className="text-sm text-warning">Couldn&apos;t load your templates from Meta. Reload to try again.</p>
      ) : approved.length === 0 ? (
        <p className="text-sm text-white/70">No approved templates yet. Create them in Meta&apos;s WhatsApp Manager.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`${id}-k`} className="sr-only">
              Template
            </label>
            <select
              id={`${id}-k`}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setEdited({});
              }}
              className="admin-input min-w-0 flex-1"
            >
              <option value="">Choose a template…</option>
              {approved.map((t) => (
                <option key={keyOf(t)} value={keyOf(t)}>
                  {t.name.replace(/_/g, " ")} ({t.language})
                </option>
              ))}
            </select>
            {orderSelect}
          </div>
          {template ? (
            <>
              {template.params.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {template.params.map((p) => (
                    <div key={p}>
                      <label htmlFor={`${id}-${p}`} className="mb-1 block text-xs text-white/55">
                        {p.replace(/_/g, " ")}
                      </label>
                      <input id={`${id}-${p}`} value={values[p]} maxLength={1000} onChange={(e) => setEdited((x) => ({ ...x, [p]: e.target.value }))} className="admin-input" />
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="rounded-xl bg-emerald-500/10 p-3 text-sm whitespace-pre-line text-emerald-50/90">{fillTemplate(template.body, values)}</p>
              <button type="submit" disabled={!ready || pending} className="admin-btn-primary w-full sm:w-auto">
                <SendHorizontal className="size-4" aria-hidden />
                {pending ? "Sending…" : "Send template"}
              </button>
            </>
          ) : null}
        </>
      )}
    </form>
  );
}
