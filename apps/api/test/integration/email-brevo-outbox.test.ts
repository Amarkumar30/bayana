import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The real outbox with EMAIL_TRANSPORT=brevo_api: config is read when first imported, and vitest isolates modules per file.
// Brevo itself is a stubbed global fetch, so nothing leaves the machine.
const apiKey = "xkeysib-FAKE-KEY-NEVER-PRINT-0123456789abcdef";
Object.assign(process.env, { EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: apiKey, EMAIL_FROM: "Bayana Test <bookings@bayana.in>" });
const { pool } = await import("../../src/database.js");
const { createLogger, setLogger } = await import("../../src/logger.js");
const { BACKOFF_MINUTES, enqueue, pendingRetryInMs, PRIORITY, sendDueNow, sendOutbox } = await import("../../src/notifications/outbox.js");
const { app } = await import("../../src/app.js");

let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Earlier runs may leave queued mail behind; settle it with Brevo answering 2xx so these tests count only their own rows.
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response("{}", { status: 201 })));
  for (let round = 0; round < 100; round++) { const result = await sendOutbox({ limit: 200 }); if (!result.sent && !result.retrying && !result.failed) break; }
  vi.unstubAllGlobals();
}, 120_000);

const lines: string[] = [];
setLogger(createLogger(new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }), "info"));
afterEach(() => { vi.unstubAllGlobals(); lines.length = 0; });
afterAll(async () => { setLogger(createLogger()); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); for (const name of ["EMAIL_TRANSPORT", "BREVO_API_KEY", "EMAIL_FROM"]) delete process.env[name]; });

const queueCode = async (code: string) => {
  const to = `brevo-${randomUUID().slice(0, 8)}@example.test`;
  const id = await enqueue(pool, "otp", to, { code, action: "sign in", minutes: 10 }, { priority: PRIORITY.urgent });
  return { to, id };
};
// Only calls to Brevo are stubbed; the test's own requests to the local API go through the real fetch.
const realFetch = globalThis.fetch;
const brevo = (status: number, body: unknown) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => String(url).startsWith("https://api.brevo.com/") ? fetch(url, init) : realFetch(url, init));
  return fetch;
};
const row = async (to: string) => (await pool.query("SELECT status,attempts,last_error,provider_message_id,next_attempt_at>now() AS later,EXTRACT(EPOCH FROM next_attempt_at-now())::int AS wait FROM email_outbox WHERE recipient=$1", [to])).rows[0];
const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => { for (let attempt = 0; attempt < 150; attempt++) { const value = await read(); if (done(value)) return value; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error("condition never met"); };
const requestCode = async (email: string) => {
  const response = await realFetch(`${base}/v1/auth/booking/otp/request`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` }, body: JSON.stringify({ email }) });
  return { status: response.status, body: await response.text() };
};
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
  it("stores Brevo's message id on the sent row and tags the email with its template", async () => {
    const fetch = brevo(201, { messageId: "<msg-2@smtp-relay.mailin.fr>" });
    const { to } = await queueCode("553201");
    await sendOutbox({ urgentOnly: true, limit: 50 });
    expect(await row(to)).toMatchObject({ status: "sent", provider_message_id: "<msg-2@smtp-relay.mailin.fr>" });
    expect(JSON.parse(String(sentTo(fetch, to)?.[1]?.body)).tags).toEqual(["otp"]);
  });
  it.each([[401, { code: "unauthorized", message: `Key not found ${apiKey}` }, "Brevo API 401 failed: unauthorized"], [400, { code: "invalid_parameter" }, "Brevo API 400 failed: invalid_parameter"]])(
    "a %i from Brevo is permanent: the email is marked failed at once, not retried, and the key never reaches the row or the log", async (status, body, error) => {
      brevo(status, body);
      const { to } = await queueCode("284716");
      await sendOutbox({ urgentOnly: true, limit: 50 });
      expect(await row(to)).toMatchObject({ status: "failed", attempts: 1, last_error: error, provider_message_id: null });
      const failed = lines.map(line => JSON.parse(line)).filter(line => line.event === "email.send_failed");
      expect(failed).toContainEqual(expect.objectContaining({ gaveUp: "refused", attempts: 1 }));
      for (const secret of [apiKey, "284716", to]) expect(lines.join("\n")).not.toContain(secret);
    });
  it.each([[503, { message: "busy" }, "Brevo API 503 failed: no error code"], [429, { code: "too_many_requests" }, "Brevo API 429 failed: too_many_requests"]])(
    "a %i from Brevo is temporary: the email stays queued with the existing backoff and a retry is scheduled in this process", async (status, body, error) => {
      brevo(status, body);
      const { to } = await queueCode("619027");
      await sendOutbox({ urgentOnly: true, limit: 50 });
      const queued = await row(to);
      expect(queued).toMatchObject({ status: "queued", attempts: 1, last_error: error, later: true });
      expect(queued.wait).toBeGreaterThan(BACKOFF_MINUTES[0] * 60 - 10); expect(queued.wait).toBeLessThanOrEqual(BACKOFF_MINUTES[0] * 60);
      // The in-process retry is due when the backoff ends, so it does not wait for a scheduled tick.
      expect(pendingRetryInMs()).toBeGreaterThan(BACKOFF_MINUTES[0] * 60_000 - 5_000); expect(pendingRetryInMs()).toBeLessThanOrEqual(BACKOFF_MINUTES[0] * 60_000);
      for (const secret of [apiKey, "619027", to]) expect(lines.join("\n")).not.toContain(secret);
    });
  it("Brevo not answering within the timeout is temporary, and the retry sends the email once it is due", async () => {
    // A stalled connection: the request only ends when its signal aborts (here after 50 ms instead of 10 s).
    vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => String(url).startsWith("https://api.brevo.com/")
      ? new Promise((_resolve, reject) => { const abort = () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })); init?.signal?.addEventListener("abort", abort); setTimeout(abort, 50); })
      : realFetch(url, init));
    const { to } = await queueCode("740318");
    await sendOutbox({ urgentOnly: true, limit: 50 });
    expect(await row(to)).toMatchObject({ status: "queued", attempts: 1, last_error: "Brevo API request failed: no answer within 10 s" });
    // Backoff over: the next attempt (the in-process retry, a kick or a tick) delivers it.
    brevo(201, { messageId: "<msg-3@smtp-relay.mailin.fr>" });
    await pool.query("UPDATE email_outbox SET next_attempt_at=now() WHERE recipient=$1", [to]);
    await sendDueNow();
    expect(await row(to)).toMatchObject({ status: "sent", attempts: 1, provider_message_id: "<msg-3@smtp-relay.mailin.fr>" });
  });
  it("a login code is not retried once a retry would arrive after the code expired", async () => {
    brevo(503, {});
    const { to } = await queueCode("905114");
    // Queued 8 minutes ago with one failure behind it: the next retry (5 minutes) would land after the 10-minute expiry.
    await pool.query("UPDATE email_outbox SET created_at=now()-interval '8 minutes',attempts=1 WHERE recipient=$1", [to]);
    await sendOutbox({ urgentOnly: true, limit: 50 });
    expect(await row(to)).toMatchObject({ status: "failed", attempts: 2 });
    expect(lines.map(line => JSON.parse(line)).filter(line => line.event === "email.send_failed")).toContainEqual(expect.objectContaining({ gaveUp: "code_expired" }));
  });
});

describe("a code request sends at once, after the response", () => {
  it("records the attempt straight away (no tick), and answers exactly the same whether Brevo accepts or fails", async () => {
    brevo(201, { messageId: "<msg-4@smtp-relay.mailin.fr>" });
    const accepted = `ok-${randomUUID().slice(0, 8)}@example.test`;
    const first = await requestCode(accepted);
    expect(await until(() => row(accepted), value => value?.status === "sent")).toMatchObject({ status: "sent", attempts: 0, provider_message_id: "<msg-4@smtp-relay.mailin.fr>" });

    brevo(503, {});
    const failing = `down-${randomUUID().slice(0, 8)}@example.test`;
    const second = await requestCode(failing);
    expect(await until(() => row(failing), value => value?.attempts === 1)).toMatchObject({ status: "queued", attempts: 1, later: true });

    expect(first).toEqual({ status: 202, body: JSON.stringify({ ok: true }) });
    expect(second).toEqual(first);
    for (const secret of [apiKey, accepted, failing]) expect(lines.join("\n")).not.toContain(secret);
  });
});
