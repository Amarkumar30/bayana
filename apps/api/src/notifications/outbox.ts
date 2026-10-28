import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { config } from "../config.js";
import { pool } from "../database.js";
import { sendEmail } from "../email.js";
import { log } from "../logger.js";
import { renderTemplate, type TemplateData, type TemplateName } from "./templates.js";

// The email outbox (SPEC 15.1): written in the business transaction, sent later with retry. A booking never fails
// because mail is down; at worst its email is late.

/** Minutes to wait after the 1st, 2nd, 3rd and 4th failed attempt; the 5th failure marks the email failed. */
export const BACKOFF_MINUTES = [1, 5, 30, 120];
export const PRIORITY = { urgent: 0, normal: 5 } as const;
type Options = { bookingId?: string | null; priority?: number; dedupeKey?: string; senderName?: string };

/** Renders and queues one email. Returns its id, or null when an email with the same dedupe key already exists. */
export async function enqueue<K extends TemplateName>(db: Pool | PoolClient, template: K, to: string, data: TemplateData[K], options: Options = {}) {
  const email = renderTemplate(template, data);
  const inserted = await db.query<{ id: string }>("INSERT INTO email_outbox(id,booking_id,recipient,subject,text_body,html_body,template,priority,dedupe_key,sender_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id",
    [randomUUID(), options.bookingId ?? null, to, email.subject, email.text, email.html, template, options.priority ?? PRIORITY.normal, options.dedupeKey ?? null, options.senderName?.slice(0, 120) ?? null]);
  return inserted.rows[0]?.id ?? null;
}

/** "Business name via Bayana <hello@…>": the business is the visible sender, the address stays ours (SPF/DKIM). */
function fromHeader(senderName: string | null) {
  const from = config.EMAIL_FROM ?? "Bayana <hello@bayana.in>";
  if (!senderName) return from;
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return `"${senderName.replace(/["\\\r\n]/g, "")} via Bayana" <${address}>`;
}

type Claimed = { id: string; recipient: string; subject: string; text_body: string; html_body: string | null; attempts: number; template: string; sender_name: string | null; priority: number };
/**
 * Sends due emails, most urgent first. Rows are claimed with FOR UPDATE SKIP LOCKED plus a short lease, so two
 * overlapping ticks (or a tick and an immediate send) never send the same email twice.
 */
export async function sendOutbox(options: { limit?: number; urgentOnly?: boolean } = {}) {
  const claimed = await pool.query<Claimed>(`UPDATE email_outbox SET locked_until=now()+interval '2 minutes'
    WHERE id IN (SELECT id FROM email_outbox WHERE status='queued' AND next_attempt_at<=now() AND (locked_until IS NULL OR locked_until<now()) ${options.urgentOnly ? `AND priority=${PRIORITY.urgent}` : ""}
      ORDER BY priority, next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
    RETURNING id,recipient::text AS recipient,subject,text_body,html_body,attempts,template,sender_name,priority`, [options.limit ?? 25]);
  const result = { sent: 0, retrying: 0, failed: 0 };
  for (const email of claimed.rows.sort((a, b) => a.priority - b.priority)) {
    try {
      await sendEmail({ from: fromHeader(email.sender_name), to: email.recipient, subject: email.subject, text: email.text_body, html: email.html_body ?? undefined });
      // A sent login code has no further use; do not keep it at rest.
      await pool.query(`UPDATE email_outbox SET status='sent',sent_at=now(),locked_until=NULL,last_error=NULL${email.template === "otp" ? ",subject='Your Bayana code',text_body='[code removed after sending]',html_body=NULL,body_purged_at=now()" : ""} WHERE id=$1`, [email.id]);
      result.sent++;
    } catch (error) {
      const attempts = email.attempts + 1, message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const delay = BACKOFF_MINUTES[attempts - 1];
      if (delay === undefined) await pool.query("UPDATE email_outbox SET status='failed',attempts=$2,last_error=$3,failed_at=now(),locked_until=NULL WHERE id=$1", [email.id, attempts, message]);
      else await pool.query("UPDATE email_outbox SET attempts=$2,last_error=$3,next_attempt_at=now()+make_interval(mins => $4),locked_until=NULL WHERE id=$1", [email.id, attempts, message, delay]);
      delay === undefined ? result.failed++ : result.retrying++;
      log(delay === undefined ? "error" : "warn", "email.send_failed", { outboxId: email.id, template: email.template, attempts, err: message.slice(0, 200) });
    }
  }
  return result;
}

/**
 * Called after a transaction that queued urgent mail commits: sends due priority-0 emails (codes, payments,
 * confirmations) now instead of at the next tick. Fire and forget; a failure just leaves the row for the tick.
 * Batches continue while they come back full (at most URGENT_BATCHES), so a backlog of older urgent mail never keeps a
 * new sign-in code waiting for the next tick.
 */
const URGENT_BATCH = 10, URGENT_BATCHES = 5;
export async function sendUrgentNow() {
  for (let batch = 0; batch < URGENT_BATCHES; batch++) {
    const result = await sendOutbox({ urgentOnly: true, limit: URGENT_BATCH });
    if (result.sent + result.retrying + result.failed < URGENT_BATCH) return;
  }
}
export function kickUrgent() {
  setImmediate(() => { sendUrgentNow().catch(error => log("error", "email.kick_failed", { err: error instanceof Error ? error.message : String(error) })); });
}
