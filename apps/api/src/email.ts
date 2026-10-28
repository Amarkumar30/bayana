import nodemailer from "nodemailer";
import { config } from "./config.js";
import { sendViaBrevo } from "./email-brevo.js";
import { log } from "./logger.js";

export type Email = { from: string; to: string; subject: string; text: string; html?: string };
const captured: Email[] = [];
export const capturedEmails = () => [...captured];
export const clearCapturedEmails = () => { captured.length = 0; };
let testTransport: ((message: Email) => Promise<void>) | null = null;
/** Test hook (NODE_ENV=test only): replace delivery, for example with one that throws to simulate SMTP being down. */
export function useTestTransport(transport: ((message: Email) => Promise<void>) | null) {
  if (config.NODE_ENV !== "test") throw new Error("useTestTransport is for tests only");
  testTransport = transport;
}
let smtp: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Delivers one email now. Business code never calls this directly: it queues through notifications/outbox.ts. */
export async function sendEmail(message: Email) {
  if (testTransport) return testTransport(message);
  if (config.EMAIL_TRANSPORT === "capture") { captured.push(message); return; }
  if (config.EMAIL_TRANSPORT === "log") { log("info", "email.queued", { to: message.to, subject: message.subject }); return; }
  if (config.EMAIL_TRANSPORT === "brevo_api") {
    // Only the status and Brevo's message id are logged: never the key, the address or the body.
    const sent = await sendViaBrevo(message, { apiKey: config.BREVO_API_KEY! });
    log("info", "email.sent", { transport: "brevo_api", status: sent.status, messageId: sent.messageId });
    return;
  }
  smtp ??= nodemailer.createTransport(config.SMTP_URL!);
  await smtp.sendMail(message);
}
