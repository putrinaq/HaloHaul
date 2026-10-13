import { Resend } from "resend";
import { env } from "./env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let client: Resend | undefined;

/**
 * Minimal transactional send. Without RESEND_API_KEY (local dev) the email is
 * printed to the console instead. Branded React Email templates arrive with
 * the notification work in Phase 3.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  client ??= new Resend(e.RESEND_API_KEY);
  const { error } = await client.emails.send({ from: e.EMAIL_FROM, ...email });
  if (error) throw new Error(`Resend failed: ${error.name}: ${error.message}`);
}
