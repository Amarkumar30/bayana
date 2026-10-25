import type { Email } from "./email.js";

// Brevo's transactional email API over HTTPS (port 443), for hosts that block or throttle outbound SMTP ports.
// https://developers.brevo.com/reference/sendtransacemail
export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
export const BREVO_TIMEOUT_MS = 10_000;

/** A failed send. The message holds the HTTP status and Brevo's short error code only: never the key, address or body. */
export class BrevoSendError extends Error {
  constructor(readonly status: number | null, detail: string) { super(`Brevo API ${status ?? "request"} failed: ${detail}`); this.name = "BrevoSendError"; }
}

/** "Bayana <bookings@bayana.in>" or "Studio via Bayana <bookings@bayana.in>" -> { name, email }; a bare address -> { email }. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (match) return match[1] ? { name: match[1], email: match[2] } : { email: match[2] };
  return { email: from.trim() };
}

/**
 * Sends one email through Brevo. Resolves with Brevo's message id on 2xx; throws BrevoSendError on 4xx, 5xx, a network
 * error or the timeout, so the outbox's retry and backoff apply exactly as they do for SMTP.
 */
export async function sendViaBrevo(message: Email, options: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number }): Promise<{ status: number; messageId: string | null }> {
  const { apiKey, fetch: send = fetch, timeoutMs = BREVO_TIMEOUT_MS } = options;
  const body = { sender: parseSender(message.from), to: [{ email: message.to }], subject: message.subject, textContent: message.text, ...(message.html ? { htmlContent: message.html } : {}) };
  let response: Response;
  try {
    response = await send(BREVO_SEND_URL, { method: "POST", headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new BrevoSendError(null, timedOut ? `no answer within ${timeoutMs / 1000} s` : `network error (${error instanceof Error ? error.name : "unknown"})`);
  }
  const payload = await response.json().catch(() => null) as { messageId?: unknown; code?: unknown } | null;
  // Brevo's error "code" is a short machine word (unauthorized, invalid_parameter...); its free-text message is not kept.
  if (!response.ok) throw new BrevoSendError(response.status, typeof payload?.code === "string" ? payload.code.slice(0, 40) : "no error code");
  return { status: response.status, messageId: typeof payload?.messageId === "string" ? payload.messageId : null };
}
