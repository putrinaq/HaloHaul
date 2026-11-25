import { describe, expect, it } from "vitest";
import { parseEvolution } from "./evolution";

const upsert = (over: Record<string, unknown>, key: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  instance: "halohaul",
  data: { key: { id: "3A1", remoteJid: "60123456789@s.whatsapp.net", fromMe: false, ...key }, pushName: "Aina", messageType: "conversation", messageTimestamp: 1749416383, message: { conversation: "Hi" }, ...over },
});
const one = (p: unknown) => parseEvolution(p, "halohaul").messages[0];

describe("parseEvolution", () => {
  it("reads a text message", () => {
    expect(one(upsert({ message: { conversation: "Hi\0" } }))).toEqual({
      waId: "3A1", direction: "in", phone: "+60123456789", userRef: null, username: null, profileName: "Aina", kind: "text", body: "Hi", media: null, at: new Date(1749416383000),
    });
  });

  it("takes messages sent from the phone as ours, without our own name", () => {
    expect(one(upsert({ pushName: "Você" }, { fromMe: true }))).toMatchObject({ direction: "out", phone: "+60123456789", profileName: null });
  });

  it("uses the hidden id when there's no number, and the number when there is", () => {
    expect(one(upsert({}, { remoteJid: "123456@lid" }))).toMatchObject({ phone: null, userRef: "123456@lid" });
    expect(one(upsert({}, { remoteJid: "123456@lid", remoteJidAlt: "60123456789@s.whatsapp.net" }))).toMatchObject({ phone: "+60123456789", userRef: "123456@lid" });
  });

  it("drops groups, statuses, channels and other instances", () => {
    for (const remoteJid of ["1203630@g.us", "status@broadcast", "123@newsletter", "60123456789@s.whatsapp.net.evil", ""]) expect(one(upsert({}, { remoteJid })), remoteJid).toBeUndefined();
    expect(parseEvolution(upsert({}), "someone-else").messages).toEqual([]);
    for (const junk of [null, 1, {}, { event: "messages.upsert", instance: "halohaul" }]) expect(parseEvolution(junk, "halohaul")).toEqual({ messages: [], statuses: [] });
  });

  it("reads files, and leaves huge ones on the phone", () => {
    const image = (fileLength: unknown) => one(upsert({ messageType: "imageMessage", message: { imageMessage: { mimetype: "image/jpeg; x", caption: "this", fileLength } } }));
    expect(image({ low: 5000, high: 0, unsigned: true })).toMatchObject({ kind: "image", body: "this", media: { id: "3A1", mime: "image/jpeg", name: null } });
    expect(image("99999999999").media).toBeNull();
    expect(image({ low: 0, high: 1, unsigned: true }).media).toBeNull();
    expect(image(undefined).media).not.toBeNull();
  });

  it("unwraps disappearing messages and never copies view-once ones", () => {
    expect(one(upsert({ messageType: "ephemeralMessage", message: { ephemeralMessage: { message: { extendedTextMessage: { text: "soon gone" } } } } }))).toMatchObject({ kind: "text", body: "soon gone" });
    expect(one(upsert({ messageType: "viewOnceMessageV2", message: { viewOnceMessageV2: { message: { imageMessage: {} } } } }))).toMatchObject({ kind: "view_once", media: null });
  });

  it("ignores WhatsApp's bookkeeping but notes unknown kinds", () => {
    for (const messageType of ["protocolMessage", "senderKeyDistributionMessage", "unknown"]) expect(one(upsert({ messageType, message: { [messageType]: {} } }))).toBeUndefined();
    expect(one(upsert({ messageType: "pollCreationMessage", message: { pollCreationMessage: {} } }))).toMatchObject({ kind: "other" });
    expect(one(upsert({ messageType: "reactionMessage", message: { reactionMessage: { text: "" } } }))).toBeUndefined();
  });

  it("reads delivery updates for our own messages only", () => {
    const update = (data: Record<string, unknown>) => parseEvolution({ event: "messages.update", instance: "halohaul", data }, "halohaul").statuses;
    expect(update({ keyId: "3EB0", fromMe: true, status: "DELIVERY_ACK" })).toEqual([{ waId: "3EB0", status: "delivered", error: null }]);
    expect(update({ keyId: "3EB0", fromMe: true, status: "PLAYED" })[0].status).toBe("read");
    expect(update({ keyId: "3EB0", fromMe: false, status: "READ" })).toEqual([]);
    expect(update({ keyId: "3EB0", fromMe: true, status: "PENDING" })).toEqual([]);
  });
});
