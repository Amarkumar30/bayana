import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/database.js";
import { AppError, errorHandler, notFoundHandler } from "../../src/errors.js";
import { createLogger, log, setLogger } from "../../src/logger.js";

type Server = ReturnType<typeof app.listen>;
const listen = (handler: express.Express) => new Promise<{ server: Server; url: string }>(resolve => { const server = handler.listen(0, () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })); });
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));
const errorShape = { error: { code: expect.any(String), message: expect.any(String), details: expect.any(Object) } };

const lines: string[] = [];
const capture = new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } });

let real: { server: Server; url: string };
let synthetic: { server: Server; url: string };
beforeAll(async () => {
  setLogger(createLogger(capture, "info"));
  real = await listen(app);
  const probe = express();
  probe.use(express.json());
  probe.get("/boom", () => { throw new Error("database password=hunter2 exploded"); });
  probe.get("/teapot", () => { throw new AppError(409, "SLOT_TAKEN", "That time was just taken", { slot: "x" }); });
  probe.get("/legacy", () => { throw Object.assign(new Error("Hold expired"), { status: 409 }); });
  probe.post("/json", (_req, res) => { res.json({ ok: true }); });
  probe.use(notFoundHandler);
  probe.use(errorHandler);
  synthetic = await listen(probe);
});
afterAll(async () => { await close(real.server); await close(synthetic.server); await pool.end(); });

describe("central error handler", () => {
  it("returns the error shape for unknown routes", async () => {
    const response = await fetch(`${real.url}/v1/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found", details: {} } });
  });
  it("maps Zod failures to 400 VALIDATION_ERROR", async () => {
    const response = await fetch(`${real.url}/v1/auth/signup/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "not-an-email" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(errorShape);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
  it("maps malformed JSON to 400 INVALID_JSON", async () => {
    const response = await fetch(`${synthetic.url}/json`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
  });
  it("hides unexpected errors behind a generic 500 with no stack or message leak", async () => {
    const response = await fetch(`${synthetic.url}/boom`);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error", details: {} } });
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain(" at ");
  });
  it("passes through AppError status, code and details", async () => {
    const response = await fetch(`${synthetic.url}/teapot`);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "SLOT_TAKEN", message: "That time was just taken", details: { slot: "x" } } });
  });
  it("gives legacy status-only errors a 4xx code instead of INTERNAL_ERROR", async () => {
    const response = await fetch(`${synthetic.url}/legacy`);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REQUEST_FAILED");
  });
});

describe("API middleware", () => {
  it("serves /health and sets a request id and helmet headers", async () => {
    const response = await fetch(`${real.url}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-powered-by")).toBeNull();
  });
  it("allows only configured origins", async () => {
    const allowed = await fetch(`${real.url}/health`, { headers: { origin: config.WEB_ORIGINS[0] } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(config.WEB_ORIGINS[0]);
    const denied = await fetch(`${real.url}/health`, { headers: { origin: "https://evil.example" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("structured logging", () => {
  it("redacts sensitive keys at any depth and keeps the event name", () => {
    lines.length = 0;
    log("info", "probe", { requestId: "r1", headers: { cookie: "bayana_session=abc", authorization: "Bearer xyz" }, body: { email: "a@b.test", password: "pw-123456789", code: "123456", otp: "654321", token: "t", nested: [{ client_secret: "s" }] } });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: "info", event: "probe", requestId: "r1", headers: { cookie: "[REDACTED]", authorization: "[REDACTED]" }, body: { email: "a@b.test", password: "[REDACTED]", code: "[REDACTED]", otp: "[REDACTED]", token: "[REDACTED]", nested: [{ client_secret: "[REDACTED]" }] } });
    expect(lines[0]).not.toMatch(/abc|xyz|pw-123456789|123456|654321/);
  });
  it("logs the 500 stack server-side with the request id", async () => {
    lines.length = 0;
    const response = await fetch(`${synthetic.url}/boom`);
    const entry = JSON.parse(lines.find(line => line.includes("request.failed")) ?? "{}");
    expect(entry.status).toBe(500);
    expect(entry.err.stack).toContain("Error");
    expect(response.status).toBe(500);
  });
});
