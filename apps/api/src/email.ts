import nodemailer from "nodemailer";
import { config } from "./config.js";
import { sendViaBrevo } from "./email-brevo.js";
import { log } from "./logger.js";

/** tag: the template name, sent to Brevo as a tag so its logs can be filtered by kind of email (never shown to the recipient). */
export type Email = { from: string; to: string; subject: string; text: string; html?: string; tag?: string };
/** What a delivery returns: the provider's message id when it gives one (Brevo), else null. */
export type Sent = { messageId: string | null };
/** SMTP gives up after this long, so a blocked port fails within one attempt instead of Nodemailer's 2-minute default. */
export const SMTP_TIMEOUT_MS = 10_000;
const captured: Email[] = [];
export const capturedEmails = () => [...captured];
export const clearCapturedEmails = () => { captured.length = 0; };
let testTransport: ((message: Email) => Promise<void | Sent>) | null = null;
/** Test hook (NODE_ENV=test only): replace delivery, for example with one that throws to simulate SMTP being down. */
export function useTestTransport(transport: ((message: Email) => Promise<void | Sent>) | null) {
  if (config.NODE_ENV !== "test") throw new Error("useTestTransport is for tests only");
  testTransport = transport;
}
let smtp: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Delivers one email now. Business code never calls this directly: it queues through notifications/outbox.ts. */
export async function sendEmail(message: Email): Promise<Sent> {
  if (testTransport) return (await testTransport(message)) ?? { messageId: null };
  if (config.EMAIL_TRANSPORT === "capture") { captured.push(message); return { messageId: null }; }
  if (config.EMAIL_TRANSPORT === "log") { log("info", "email.queued", { to: maskAddress(message.to), subject: message.tag === "otp" ? "[login code]" : message.subject }); return { messageId: null }; }
  if (config.EMAIL_TRANSPORT === "brevo_api") {
    // Only the status and Brevo's message id are logged: never the key, the address or the body.
    const sent = await sendViaBrevo(message, { apiKey: config.BREVO_API_KEY! });
    log("info", "email.sent", { transport: "brevo_api", status: sent.status, messageId: sent.messageId, template: message.tag });
    return { messageId: sent.messageId };
  }
  smtp ??= nodemailer.createTransport({ url: config.SMTP_URL!, connectionTimeout: SMTP_TIMEOUT_MS, greetingTimeout: SMTP_TIMEOUT_MS, socketTimeout: SMTP_TIMEOUT_MS });
  const { tag: _tag, ...mail } = message;
  await smtp.sendMail(mail);
  return { messageId: null };
}

/** "asha.rao@example.in" -> "a***@example.in": enough to tell recipients apart in a log, not enough to read the address. */
export function maskAddress(address: string) {
  const at = address.lastIndexOf("@");
  return at < 1 ? "***" : `${address[0]}***${address.slice(at)}`;
}
