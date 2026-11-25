"use client";

import { Smartphone, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { linkWhatsappAction, unlinkWhatsappAction } from "@/app/admin/_actions/whatsapp";
import { ErrorNote, useAction } from "@/components/admin/dialogs/shared";
import { useDone } from "@/components/admin/Toast";
import { Badge, Panel } from "@/components/admin/ui";

type State = "open" | "connecting" | "close" | "missing" | "unreachable";

const LABEL: Record<State, { text: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  open: { text: "Linked", tone: "success" },
  connecting: { text: "Waiting for the scan", tone: "warning" },
  close: { text: "Disconnected", tone: "danger" },
  missing: { text: "Not linked", tone: "neutral" },
  unreachable: { text: "Evolution API isn't running", tone: "danger" },
};

const REFRESH_MS = 5000;

/** Links a phone by QR code, the way web.whatsapp.com does. */
export function LinkPanel({ initial }: { initial: State }) {
  const router = useRouter();
  const done = useDone();
  const [state, setState] = useState(initial);
  const [qr, setQr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [linking, setLinking] = useState(false);
  const { pending, error, run, setError } = useAction();

  // WhatsApp changes the code every so often, and the scan finishes on the phone.
  const refresh = useEffectEvent(async () => {
    const r = await linkWhatsappAction({ confirmed: true }).catch(() => null);
    if (!r) return;
    if (!r.ok) {
      setError(r.error);
      setLinking(false);
      return;
    }
    setState(r.data.state);
    setQr(r.data.qr);
    if (r.data.state === "open") {
      setLinking(false);
      done("WhatsApp linked");
    } else if (r.data.state === "unreachable") setLinking(false);
  });
  useEffect(() => {
    if (!linking) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (!stop) timer = setTimeout(loop, REFRESH_MS);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [linking]);

  const label = LABEL[state];
  return (
    <Panel title="WhatsApp" actions={<Badge tone={label.tone}>{label.text}</Badge>}>
      <ErrorNote message={error} className="mb-3" />
      {state === "open" ? (
        <div className="space-y-4">
          <p className="text-white/70">New messages to this number show up in Messages. Keep the phone connected to the internet at least every two weeks, or WhatsApp logs it out here.</p>
          <button
            type="button"
            disabled={pending}
            className="admin-btn-secondary"
            onClick={() => {
              if (!window.confirm("Unlink WhatsApp? Messages stop arriving here until you scan again. Saved chats stay.")) return;
              run(
                () => unlinkWhatsappAction({}),
                () => {
                  setState("missing");
                  setSure(false);
                  router.refresh();
                },
              );
            }}
          >
            <Unlink className="size-4" aria-hidden />
            {pending ? "Unlinking…" : "Unlink"}
          </button>
        </div>
      ) : linking ? (
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="grid size-56 shrink-0 place-items-center self-center rounded-2xl bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL */}
            {qr ? <img src={qr} alt="QR code to scan with WhatsApp" className="size-full" /> : <span className="text-sm text-black/60">Getting the code…</span>}
          </div>
          <div className="space-y-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-white/75">
              <li>Open WhatsApp on the phone with the spare number.</li>
              <li>
                Go to <strong>Settings → Linked devices → Link a device</strong>.
              </li>
              <li>Scan this code. It changes by itself if it runs out.</li>
            </ol>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => {
                setLinking(false);
                setQr(null);
              }}
            >
              Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-white/70">
            {state === "unreachable"
              ? "The WhatsApp service on the server isn't answering. Start it (docs/WHATSAPP.md), then reload."
              : "This links a phone the way WhatsApp Web does. It isn't WhatsApp's official API, so they can ban the number. Every private chat on it will be saved here."}
          </p>
          {state !== "unreachable" ? (
            <>
              <label className="flex cursor-pointer items-start gap-2.5 text-white/85">
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 size-4 accent-sky-500" />
                This is a spare number used only for HaloHaul, and I can afford to lose it.
              </label>
              <button type="button" disabled={!sure} className="admin-btn-primary" onClick={() => setLinking(true)}>
                <Smartphone className="size-4" aria-hidden />
                {state === "missing" ? "Link a phone" : "Link again"}
              </button>
            </>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
