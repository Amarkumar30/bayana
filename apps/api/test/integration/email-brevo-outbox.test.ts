import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The real outbox with EMAIL_TRANSPORT=brevo_api: config is read when first imported, and vitest isolates modules per file.
// Brevo itself is a stubbed global fetch, so nothing leaves the machine.
const apiKey = "xkeysib-FAKE-KEY-NEVER-PRINT-0123456789abcdef";
Object.assign(process.env, { EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: apiKey, EMAIL_FROM: "Bayana Test <bookings@bayana.in>" });
const { pool } = await import("../../src/database.js");
const { createLogger, setLogger } = await import("../../src/logger.js");
const { enqueue, PRIORITY, sendOutbox } = await import("../../src/notifications/outbox.js");

const lines: string[] = [];
setLogger(createLogger(new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }), "info"));
afterEach(() => { vi.unstubAllGlobals(); lines.length = 0; });
afterAll(async () => { setLogger(createLogger()); await pool.end(); for (const name of ["EMAIL_TRANSPORT", "BREVO_API_KEY", "EMAIL_FROM"]) delete process.env[name]; });

const queueCode = async (code: string) => {
  const to = `brevo-${randomUUID().slice(0, 8)}@example.test`;
  const id = await enqueue(pool, "otp", to, { code, action: "sign in", minutes: 10 }, { priority: PRIORITY.urgent });
  return { to, id };
};
const brevo = (status: number, body: unknown) => { const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(body), { status })); vi.stubGlobal("fetch", fetch); return fetch; };
const row = async (to: string) => (await pool.query("SELECT status,attempts,last_error,next_attempt_at>now() AS later FROM email_outbox WHERE recipient=$1", [to])).rows[0];
const sentTo = (fetch: ReturnType<typeof brevo>, to: string) => fetch.mock.calls.find(([, init]) => JSON.parse(String(init?.body)).to[0].email === to);

describe("outbox over Brevo's HTTPS API", () => {
  it("sends through Brevo, marks the row sent, and logs only the status and message id", async () => {
    const fetch = brevo(201, { messageId: "<msg-1@smtp-relay.mailin.fr>" });
    const { to } = await queueCode("731905");
    await sendOutbox({ urgentOnly: true, limit: 50 });
    const call = sentTo(fetch, to);
    expect(call?.[1]?.headers).toMatchObject({ "api-key": apiKey });
    expect(JSON.parse(String(call?.[1]?.body)).sender).toEqual({ name: "Bayana Test", email: "bookings@bayana.in" });
    expect((await row(to)).status).toBe("sent");
    const sent = lines.map(line => JSON.parse(line)).filter(line => line.event === "email.sent");
    expect(sent).toContainEqual(expect.objectContaining({ transport: "brevo_api", status: 201, messageId: "<msg-1@smtp-relay.mailin.fr>" }));
    const log = lines.join("\n");
    for (const secret of [apiKey, "731905", to]) expect(log).not.toContain(secret);
  });
  it.each([[401, { code: "unauthorized", message: `Key not found ${apiKey}` }, "Brevo API 401 failed: unauthorized"], [503, { message: "busy" }, "Brevo API 503 failed: no error code"]])(
    "a %i from Brevo keeps the email queued with the existing backoff, and the key never reaches the row or the log", async (status, body, error) => {
      brevo(status, body);
      const { to } = await queueCode("284716");
      await sendOutbox({ urgentOnly: true, limit: 50 });
      expect(await row(to)).toMatchObject({ status: "queued", attempts: 1, last_error: error, later: true });
      const log = lines.join("\n");
      expect(lines.map(line => JSON.parse(line).event)).toContain("email.send_failed");
      for (const secret of [apiKey, "284716", to]) expect(log).not.toContain(secret);
    });
});
