import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Starts the real entry point (src/server.ts) the way the container does, with NODE_ENV=production and an incomplete env, in an
// empty folder so no .env file is read. It must refuse to start, name every problem, and never print a value it was given.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsx = createRequire(path.join(apiRoot, "package.json")).resolve("tsx/cli");
const emptyDir = mkdtempSync(path.join(tmpdir(), "bayana-startup-env-"));
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));
const start = (env: Record<string, string>) => {
  const result = spawnSync(process.execPath, [tsx, path.join(apiRoot, "src", "server.ts")], { cwd: emptyDir, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
};

// Distinctive fake secrets: if any of them shows up in the output, a value leaked.
const secrets = {
  SESSION_SECRET: "fake-session-secret-SHOULD-NEVER-PRINT-0123456789",
  SMTP_URL: "smtp://user:fake-smtp-password-NEVER-PRINT@smtp.example.test:587",
  DATABASE_URL: "postgres://bayana:fake-db-password-NEVER-PRINT@db.example.test:5432/bayana",
  RAZORPAY_KEY_SECRET: "fake-razorpay-secret-NEVER-PRINT",
  GOOGLE_CLIENT_SECRET: "fake-google-secret-NEVER-PRINT"
};

describe("API startup with production env and missing variables", () => {
  it("exits 1 and names each missing variable without printing any value", () => {
    const run = start({ NODE_ENV: "production", PAYMENT_MODE: "disabled", ...secrets, GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com" });
    expect(run.code).toBe(1);
    for (const name of ["WEB_ORIGINS", "DATABASE_URL_DIRECT", "OTP_PEPPER", "TICK_SECRET", "EMAIL_FROM", "GOOGLE_REDIRECT_URI"]) expect(run.output).toContain(`${name}:`);
    for (const value of Object.values(secrets)) expect(run.output).not.toContain(value);
    expect(run.output).not.toMatch(/NEVER-PRINT/);
    expect(run.output).not.toMatch(/server\.started/);
  });
  it("names an invalid value by its rule, never the value (a live key while payments are disabled)", () => {
    const liveKey = "rzp_live_FAKEKEYNEVERPRINT";
    const run = start({ NODE_ENV: "production", PAYMENT_MODE: "disabled", RAZORPAY_KEY_ID: liveKey, SESSION_COOKIE_NAME: "bad; Domain=evil.example", ...secrets });
    expect(run.code).toBe(1);
    expect(run.output).toContain("RAZORPAY_KEY_ID: is a live key");
    expect(run.output).toContain("SESSION_COOKIE_NAME: must be");
    expect(run.output).not.toContain(liveKey);
    expect(run.output).not.toContain("evil.example");
    expect(run.output).not.toMatch(/NEVER-PRINT/);
  });
});
