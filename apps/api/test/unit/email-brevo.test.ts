import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config-schema.js";
import { BREVO_SEND_URL, BrevoSendError, parseSender, sendViaBrevo } from "../../src/email-brevo.js";
import { maskAddress } from "../../src/email.js";

const apiKey = "xkeysib-FAKE-KEY-NEVER-PRINT-0123456789abcdef";
const message = { from: "Studio Sunday via Bayana <bookings@bayana.in>", to: "customer@example.test", subject: "Your Bayana code: 482913", text: "Use 482913 to sign in.", html: "<p>Use <b>482913</b> to sign in.</p>" };
const reply = (status: number, body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const caught = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as BrevoSendError; } throw new Error("expected a failure"); };
const leaks = (text: string) => [apiKey, "482913", message.to, message.text].filter(secret => text.includes(secret));

describe("Brevo HTTPS transport", () => {
  it("posts the email to Brevo with the api-key header and returns the message id on 2xx", async () => {
    const fetch = reply(201, { messageId: "<202610251200.123@smtp-relay.mailin.fr>" });
    await expect(sendViaBrevo(message, { apiKey, fetch })).resolves.toEqual({ status: 201, messageId: "<202610251200.123@smtp-relay.mailin.fr>" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(BREVO_SEND_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "api-key": apiKey, "content-type": "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({ sender: { name: "Studio Sunday via Bayana", email: "bookings@bayana.in" }, to: [{ email: "customer@example.test" }], subject: message.subject, textContent: message.text, htmlContent: message.html });
  });
  it("tags the email with its template name, and sends no tags when there is none", async () => {
    const fetch = reply(201, { messageId: "<id>" });
    await sendViaBrevo({ ...message, tag: "otp" }, { apiKey, fetch });
    await sendViaBrevo(message, { apiKey, fetch });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).tags).toEqual(["otp"]);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).not.toHaveProperty("tags");
  });
  it("a 2xx without a message id still counts as sent", async () => {
    await expect(sendViaBrevo(message, { apiKey, fetch: reply(202, {}) })).resolves.toEqual({ status: 202, messageId: null });
  });
  it("treats a 4xx as permanent, except 408 and 429; a 5xx, a network error or a timeout is temporary", () => {
    for (const status of [400, 401, 403, 404, 422]) expect(new BrevoSendError(status, "x").permanent, String(status)).toBe(true);
    for (const status of [408, 429, 500, 502, 503, null]) expect(new BrevoSendError(status, "x").permanent, String(status)).toBe(false);
  });
  it("masks recipient addresses for logs", () => {
    expect(maskAddress("asha.rao@example.in")).toBe("a***@example.in");
    expect(maskAddress("not-an-address")).toBe("***");
  });
  it("omits htmlContent for a text-only email", async () => {
    const fetch = reply(201, { messageId: "<id>" });
    await sendViaBrevo({ ...message, html: undefined }, { apiKey, fetch });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).not.toHaveProperty("htmlContent");
  });
  it("a 4xx is a failure with the status and Brevo's error code, and nothing else", async () => {
    // Brevo's free-text message can echo request details; only its short code is kept.
    const error = await caught(sendViaBrevo(message, { apiKey, fetch: reply(401, { code: "unauthorized", message: `Key not found: ${apiKey} for ${message.to}` }) }));
    expect(error).toBeInstanceOf(BrevoSendError);
    expect(error.status).toBe(401);
    expect(error.message).toBe("Brevo API 401 failed: unauthorized");
    expect(leaks(error.message)).toEqual([]);
  });
  it("a 5xx is a failure too, even without a JSON body", async () => {
    const error = await caught(sendViaBrevo(message, { apiKey, fetch: reply(503, "<html>Service Unavailable</html>") }));
    expect(error.status).toBe(503);
    expect(error.message).toBe("Brevo API 503 failed: no error code");
  });
  it("a network error is a failure that names only the error type", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(Object.assign(new TypeError(`fetch failed for ${apiKey}`), {}));
    const error = await caught(sendViaBrevo(message, { apiKey, fetch }));
    expect(error.status).toBeNull();
    expect(error.message).toBe("Brevo API request failed: network error (TypeError)");
  });
  it("gives up after the timeout (10 s by default) and fails", async () => {
    // A server that never answers: the request is aborted by the timeout signal.
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
    const started = Date.now();
    const error = await caught(sendViaBrevo(message, { apiKey, fetch, timeoutMs: 100 }));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(error.message).toBe("Brevo API request failed: no answer within 0.1 s");
    const defaultSignal = (await (async () => { const spy = reply(201, {}); await sendViaBrevo(message, { apiKey, fetch: spy }); return spy.mock.calls[0][1]?.signal; })());
    expect(defaultSignal).toBeInstanceOf(AbortSignal);
  });
  it("parses EMAIL_FROM forms into Brevo's sender", () => {
    expect(parseSender("Bayana <bookings@bayana.in>")).toEqual({ name: "Bayana", email: "bookings@bayana.in" });
    expect(parseSender('"Studio, Pune" <bookings@bayana.in>')).toEqual({ name: "Studio, Pune", email: "bookings@bayana.in" });
    expect(parseSender("<bookings@bayana.in>")).toEqual({ email: "bookings@bayana.in" });
    expect(parseSender("bookings@bayana.in")).toEqual({ email: "bookings@bayana.in" });
  });
});

describe("EMAIL_TRANSPORT=brevo_api config", () => {
  const base = { NODE_ENV: "production", WEB_ORIGINS: "https://bayana.in", DATABASE_URL: "postgres://u:p@db.example.test/bayana", DATABASE_URL_DIRECT: "postgres://u:p@db.example.test/bayana", SESSION_SECRET: "s".repeat(32), OTP_PEPPER: "p".repeat(32), TICK_SECRET: "t".repeat(32) };
  it("needs BREVO_API_KEY and EMAIL_FROM, not SMTP_URL", () => {
    const config = loadConfig({ ...base, EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: apiKey, EMAIL_FROM: "Bayana <bookings@bayana.in>" });
    expect(config.EMAIL_TRANSPORT).toBe("brevo_api");
    expect(config.SMTP_URL).toBeUndefined();
  });
  it("names the missing variables only", () => {
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: "brevo_api" })).toThrow(/BREVO_API_KEY: is required when EMAIL_TRANSPORT=brevo_api[\s\S]*EMAIL_FROM: is required when EMAIL_TRANSPORT=brevo_api/);
  });
  it("refuses to start a deployed production API (APP_ENV staging or production) without brevo_api, naming the variable only", () => {
    const smtp = { EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://user:smtp-pass-NEVER-PRINT@smtp-relay.brevo.com:587", EMAIL_FROM: "Bayana <bookings@bayana.in>" };
    for (const APP_ENV of ["staging", "production"]) {
      let text = "";
      try { loadConfig({ ...base, APP_ENV, ...smtp }); } catch (error) { text = (error as Error).message; }
      expect(text, APP_ENV).toContain(`EMAIL_TRANSPORT: must be brevo_api when NODE_ENV=production and APP_ENV=${APP_ENV}`);
      expect(text).not.toContain("NEVER-PRINT");
    }
    expect(() => loadConfig({ ...base, APP_ENV: "staging", EMAIL_FROM: "Bayana <bookings@bayana.in>", BREVO_API_KEY: apiKey })).toThrow("EMAIL_TRANSPORT: is required in production");
    expect(() => loadConfig({ ...base, APP_ENV: "staging", EMAIL_TRANSPORT: "brevo_api", EMAIL_FROM: "Bayana <bookings@bayana.in>" })).toThrow("BREVO_API_KEY: is required");
    expect(loadConfig({ ...base, APP_ENV: "staging", EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: apiKey, EMAIL_FROM: "Bayana <bookings@bayana.in>" }).EMAIL_TRANSPORT).toBe("brevo_api");
  });
  it("lets a production image on a laptop (APP_ENV=local, the Mailpit rehearsal) use SMTP, chosen explicitly", () => {
    expect(loadConfig({ ...base, APP_ENV: "local", EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://host.docker.internal:1025", EMAIL_FROM: "Bayana <hello@bayana.local>" }).EMAIL_TRANSPORT).toBe("smtp");
    expect(() => loadConfig({ ...base, APP_ENV: "local", SMTP_URL: "smtp://host.docker.internal:1025", EMAIL_FROM: "Bayana <hello@bayana.local>" })).toThrow("EMAIL_TRANSPORT: is required in production");
  });
  it("keeps SMTP (Mailpit) as the development default and capture as the test default", () => {
    const local = { WEB_ORIGINS: "http://localhost:3000", SESSION_SECRET: "s".repeat(32), EMAIL_FROM: "Bayana <hello@bayana.local>", SMTP_URL: "smtp://localhost:1025" };
    expect(loadConfig({ ...local, NODE_ENV: "development", DATABASE_URL: "postgres://u:p@localhost:5433/bayana_dev" }).EMAIL_TRANSPORT).toBe("smtp");
    expect(loadConfig({ ...local, NODE_ENV: "test", DATABASE_URL_TEST: "postgres://u:p@localhost:5433/bayana_test" }).EMAIL_TRANSPORT).toBe("capture");
  });
  it("rejects a too-short key by rule, never echoing it", () => {
    const short = "xkeysib-SHORT";
    let text = "";
    try { loadConfig({ ...base, EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: short, EMAIL_FROM: "Bayana <bookings@bayana.in>" }); } catch (error) { text = (error as Error).message; }
    expect(text).toContain("BREVO_API_KEY: must be");
    expect(text).not.toContain(short);
  });
});
