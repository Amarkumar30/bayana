import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";

// migrate.ts and neon-check.ts are run as real processes with nothing but NODE_ENV and a database URL. They start in an empty
// temporary folder, so dotenv finds no .env file: no mail, secrets, payment or Google variable exists.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsx = createRequire(path.join(apiRoot, "package.json")).resolve("tsx/cli");
const emptyDir = mkdtempSync(path.join(tmpdir(), "bayana-migrate-env-"));
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));
const run = (script: string, env: Record<string, string>, args: string[] = []) => {
  const result = spawnSync(process.execPath, [tsx, path.join(apiRoot, "src", script), ...args], { cwd: emptyDir, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } });
  return { code: result.status, out: result.stdout, err: result.stderr };
};
const unrelated = /SMTP_URL|EMAIL_FROM|TICK_SECRET|OTP_PEPPER|SESSION_SECRET|RAZORPAY|GOOGLE|WEB_ORIGINS/;
const testUrl = config.DATABASE_URL; // NODE_ENV=test here, so this is the _test database

describe("migrate.ts needs only NODE_ENV and the database URL", () => {
  it("reports status and applies (verifies) migrations on the test database with only those two variables", () => {
    const status = run("migrate.ts", { NODE_ENV: "test", DATABASE_URL_TEST: testUrl }, ["--status"]);
    expect(status.code, status.err).toBe(0);
    expect(status.out).toMatch(/^Database "bayana_test" \(NODE_ENV=test\): no pending migrations\./m);
    const applied = run("migrate.ts", { NODE_ENV: "test", DATABASE_URL_TEST: testUrl });
    expect(applied.code, applied.err).toBe(0);
    expect(applied.out).toContain("Checksums of applied migrations verified.");
    expect(applied.err).not.toMatch(unrelated);
  });
  it("in production it needs only DATABASE_URL_DIRECT, and the database-name safety check still refuses a _test database", () => {
    const refused = run("migrate.ts", { NODE_ENV: "production", DATABASE_URL_DIRECT: testUrl });
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("Refusing to migrate: DATABASE_URL_DIRECT must not name a _dev or _test database when NODE_ENV=production");
    expect(refused.err).not.toMatch(unrelated);
  });
  it("NODE_ENV=test refuses a database that is not _test, even for --status", () => {
    const refused = run("migrate.ts", { NODE_ENV: "test", DATABASE_URL_TEST: testUrl.replace(/bayana_test/, "bayana_dev") }, ["--status"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("must name a database ending in _test");
  });
  it("a missing URL is reported by name only, with nothing about unrelated settings", () => {
    const missing = run("migrate.ts", { NODE_ENV: "production" });
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("DATABASE_URL_DIRECT: is missing");
    expect(missing.err).not.toMatch(unrelated);
  });
});

describe("neon-check.ts loads the same database-only config", () => {
  it("runs every compatibility check against the test database with only NODE_ENV and the URL", () => {
    const checked = run("neon-check.ts", { NODE_ENV: "test", DATABASE_URL_TEST: testUrl });
    expect(checked.code, checked.err).toBe(0);
    expect(checked.out).toContain('Checking database "bayana_test"');
    expect(checked.out.match(/^PASS /gm)).toHaveLength(4);
    expect(checked.out + checked.err).not.toContain(testUrl);
  });
});
