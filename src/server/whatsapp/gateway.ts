import "server-only";
import type { WaTemplate } from "../../domain/whatsapp";
import { approvedTemplates, downloadMedia, postRead, postTemplate, postText, whatsappConfig, type Recipient, type WaConfig } from "./client";
import { evoFile, evolutionConfig, evoRead, evoText, type EvoConfig } from "./evolution";

/** How the inbox reaches WhatsApp: Meta's official API, or a linked device. */
export interface Gateway {
  kind: "meta" | "evolution";
  /** Meta only allows free-form replies for 24 hours after the customer's last message. */
  windowed: boolean;
  text(to: Recipient, body: string): Promise<string>;
  read(to: Recipient, waId: string): Promise<void>;
  file(mediaId: string): Promise<Uint8Array | null>;
  templates(): Promise<WaTemplate[]>;
  template(to: Recipient, template: WaTemplate, values: Record<string, string>): Promise<string>;
}

export const metaGateway = (c: WaConfig): Gateway => ({
  kind: "meta",
  windowed: true,
  text: (to, body) => postText(c, to, body),
  read: (_to, waId) => postRead(c, waId),
  file: (id) => downloadMedia(c, id),
  templates: () => approvedTemplates(c),
  template: (to, t, values) => postTemplate(c, to, t, values),
});

export const evolutionGateway = (c: EvoConfig): Gateway => ({
  kind: "evolution",
  windowed: false,
  text: (to, body) => evoText(c, to, body),
  read: (to, waId) => evoRead(c, to, waId),
  file: (id) => evoFile(c, id),
  templates: async () => [],
  template: () => Promise.reject(new Error("Linked devices have no templates")),
});

/** Null when neither is set up. */
export function whatsappGateway(): Gateway | null {
  const evo = evolutionConfig();
  if (evo) return evolutionGateway(evo);
  const meta = whatsappConfig();
  return meta ? metaGateway(meta) : null;
}
