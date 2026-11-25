import { describe, expect, it } from "vitest";
import { cleanParam, fillTemplate, isInlineMime, isWindowOpen, nextStatus, parseWebhook, previewOf, usableTemplates } from "./whatsapp";

const ours = "106540352242922";
const hook = (value: Record<string, unknown>, field = "messages") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: ours }, ...value } }] }],
});

describe("parseWebhook", () => {
  it("reads a text message with its sender", () => {
    const { messages } = parseWebhook(
      hook({
        contacts: [{ profile: { name: "Aina" }, wa_id: "60123456789", user_id: "MY.134" }],
        messages: [{ from: "60123456789", from_user_id: "MY.134", id: "wamid.A", timestamp: "1749416383", type: "text", text: { body: "Hi!\0" } }],
      }),
      ours,
    );
    expect(messages).toEqual([
      { waId: "wamid.A", direction: "in", phone: "+60123456789", userRef: "MY.134", username: null, profileName: "Aina", kind: "text", body: "Hi!", media: null, at: new Date(1749416383000) },
    ]);
  });

  it("copes with a username and no phone number", () => {
    const { messages } = parseWebhook(
      hook({
        contacts: [{ profile: { name: "Wei", username: "wei.ling" }, user_id: "MY.9" }],
        messages: [{ from_user_id: "MY.9", id: "wamid.B", timestamp: "1749416383", type: "text", text: { body: "hello" } }],
      }),
      ours,
    );
    expect(messages[0]).toMatchObject({ phone: null, userRef: "MY.9", username: "wei.ling" });
  });

  it("reads photos with captions and cleans the type", () => {
    const { messages } = parseWebhook(
      hook({ messages: [{ from: "60123456789", id: "wamid.C", timestamp: 1749416383, type: "audio", audio: { id: "99", mime_type: "audio/ogg; codecs=opus" } }, { from: "60123456789", id: "wamid.D", timestamp: 1749416383, type: "image", image: { id: "77", mime_type: "image/jpeg", caption: "this one" } }] }),
      ours,
    );
    expect(messages.map((m) => [m.media?.mime, m.body])).toEqual([
      ["audio/ogg", null],
      ["image/jpeg", "this one"],
    ]);
  });

  it("keeps the good messages when one is malformed", () => {
    const { messages } = parseWebhook(hook({ messages: [{ nonsense: true }, { from: "60123456789", id: "wamid.E", timestamp: 1749416383, type: "brand_new_thing" }] }), ours);
    expect(messages.map((m) => m.kind)).toEqual(["brand_new_thing"]);
  });

  it("reads delivery updates and explains failures", () => {
    const { statuses } = parseWebhook(hook({ statuses: [{ id: "wamid.X", status: "delivered" }, { id: "wamid.Y", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] }, { id: "wamid.Z", status: "played" }] }), ours);
    expect(statuses.map((s) => s.status)).toEqual(["delivered", "failed"]);
    expect(statuses[1].error).toMatch(/24 hours/);
  });

  it("ignores other numbers and anything that isn't a webhook", () => {
    const body = hook({ messages: [{ from: "60123456789", id: "wamid.F", timestamp: 1749416383, type: "text", text: { body: "x" } }] });
    expect(parseWebhook(body, "someone-else").messages).toEqual([]);
    for (const junk of [null, [], "x", {}, { object: "page", entry: [] }]) expect(parseWebhook(junk, ours)).toEqual({ messages: [], statuses: [] });
  });

  it("takes replies typed in the WhatsApp Business app as ours", () => {
    const { messages } = parseWebhook(hook({ message_echoes: [{ from: "60199999999", to: "60123456789", id: "wamid.G", timestamp: 1749416383, type: "text", text: { body: "On my phone" } }] }, "smb_message_echoes"), ours);
    expect(messages[0]).toMatchObject({ direction: "out", phone: "+60123456789", body: "On my phone" });
  });
});

describe("rules", () => {
  it("opens the reply window for exactly 24 hours", () => {
    const at = new Date("2026-11-25T00:00:00Z");
    expect(isWindowOpen(at, new Date("2026-11-25T23:59:59Z"))).toBe(true);
    expect(isWindowOpen(at, new Date("2026-11-26T00:00:00Z"))).toBe(false);
    expect(isWindowOpen(null, at)).toBe(false);
  });

  it("only moves delivery ticks forward", () => {
    expect(nextStatus("read", "delivered")).toBe("read");
    expect(nextStatus("sent", "read")).toBe("read");
    expect(nextStatus("delivered", "failed")).toBe("delivered");
    expect(nextStatus("sent", "failed")).toBe("failed");
  });

  it("never shows a type a browser could run", () => {
    for (const bad of ["text/html", "image/svg+xml", "application/pdf", "application/javascript", "image/jpeg; x", ""]) expect(isInlineMime(bad)).toBe(false);
    expect(isInlineMime("image/jpeg")).toBe(true);
  });

  it("previews messages in one line", () => {
    expect(previewOf("text", "two\nlines")).toBe("two lines");
    expect(previewOf("image", "this one")).toBe("Photo: this one");
    expect(previewOf("audio", null)).toBe("Voice message");
    expect(previewOf("order_thing", null)).toBe("Unsupported message");
  });
});

describe("approved templates", () => {
  const t = (over: Record<string, unknown>) => ({ name: "quote", language: "en", status: "APPROVED", parameter_format: "NAMED", components: [{ type: "BODY", text: "Hi {{name}}, order {{order}} for {{name}} is ready." }], ...over });
  it("keeps the ones we can fill", () => {
    expect(usableTemplates([t({})])).toEqual([{ name: "quote", language: "en", body: "Hi {{name}}, order {{order}} for {{name}} is ready.", named: true, params: ["name", "order"] }]);
    expect(usableTemplates([t({ parameter_format: "POSITIONAL", components: [{ type: "BODY", text: "Hi {{1}}!" }] })])[0]).toMatchObject({ named: false, params: ["1"] });
  });
  it("leaves out unapproved ones, media headers and buttons with blanks", () => {
    const body = { type: "BODY", text: "Hello there." };
    expect(
      usableTemplates([
        t({ status: "PENDING" }),
        t({ components: [{ type: "HEADER", format: "IMAGE" }, body] }),
        t({ components: [body, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://halohaul.com/{{1}}" }] }] }),
        "junk",
      ]),
    ).toEqual([]);
    expect(usableTemplates(undefined)).toEqual([]);
  });
  it("fills blanks without line breaks", () => {
    expect(cleanParam(" a\n b   c ")).toBe("a b c");
    expect(fillTemplate("Hi {{name}}, {{x}}", { name: "Aina\n" })).toBe("Hi Aina, ");
  });
});
