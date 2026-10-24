import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ConfigError, databaseNameProblem, loadConfig } from "../../src/config-schema.js";
import { migrationRefusal } from "../../src/migration-runner.js";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const tsx = path.join(repo, "apps/api/node_modules/tsx/dist/cli.mjs");
const secret = "s3cr3t-value-that-must-never-be-printed-0123456789";
const base = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000", DATABASE_URL: "postgres://bayana:bayana@localhost:5433/bayana_dev", SESSION_SECRET: secret, EMAIL_TRANSPORT: "log" };
const problemsOf = (input: Record<string, string>) => { try { loadConfig(input); return []; } catch (error) { if (error instanceof ConfigError) return error.problems; throw error; } };
const messageOf = (input: Record<string, string>, file?: string) => { try { loadConfig(input, file); return ""; } catch (error) { return (error as Error).message; } };
const temps: string[] = [];
const tempDir = () => { const dir = mkdtempSync(path.join(tmpdir(), "bayana-env-")); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

describe("API env messages", () => {
  it("names the variable, lists allowed values and the file to edit, without echoing the bad value", () => {
    const message = messageOf({ ...base, PAYMENT_MODE: "razorpay" });
    expect(message).toContain("Edit apps/api/.env (compare with apps/api/.env.example)");
    expect(message).toContain("PAYMENT_MODE: must be one of disabled, test, live (use disabled locally)");
    expect(message).not.toContain("razorpay");
  });
  it("reports every problem at once instead of stopping at the first", () => {
    const names = problemsOf({ NODE_ENV: "development", PAYMENT_MODE: "razorpay", SESSION_SECRET: "short", PORT: "abc" }).map(problem => problem.name);
    expect(names).toEqual(expect.arrayContaining(["PAYMENT_MODE", "SESSION_SECRET", "PORT", "WEB_ORIGINS", "DATABASE_URL", "SMTP_URL", "EMAIL_FROM"]));
  });
  it("says a missing variable is missing and what to set it to", () => {
    const { SESSION_SECRET: _omit, ...rest } = base;
    expect(messageOf(rest)).toContain("SESSION_SECRET: is missing; set it to a random value of at least 32 characters (pnpm.cmd setup:env generates one)");
  });
  it("never prints secret values, even when they are the invalid ones", () => {
    const message = messageOf({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: secret, RAZORPAY_WEBHOOK_SECRET: "short", DATABASE_URL: `postgres://u:${secret}@db/x_test` });
    expect(message).toContain("RAZORPAY_KEY_ID"); expect(message).toContain("RAZORPAY_KEY_SECRET"); expect(message).toContain("RAZORPAY_WEBHOOK_SECRET"); expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(secret); expect(message).not.toContain("short\n");
  });
  it("uses the file name it is given", () => expect(messageOf({}, "/srv/app/.env")).toContain("Edit /srv/app/.env (compare with /srv/app/.env.example)"));
  it("accepts the example file's values once secrets are filled in", () => {
    const example = Object.fromEntries(readFileSync(path.join(repo, "apps/api/.env.example"), "utf8").split(/\r?\n/).map(line => /^([A-Z0-9_]+)=(.*)$/.exec(line)).filter((match): match is RegExpExecArray => Boolean(match)).map(match => [match[1], match[2]]));
    expect(() => loadConfig({ ...example, SESSION_SECRET: secret, OTP_PEPPER: secret })).not.toThrow();
    expect(example.PAYMENT_MODE).toBe("disabled"); expect(example.SESSION_COOKIE_DOMAIN).toBe(""); expect(example.SMTP_URL).toBe("smtp://localhost:1025");
    expect(example.DATABASE_URL).toMatch(/\/bayana_dev$/); expect(example.DATABASE_URL_TEST).toMatch(/\/bayana_test$/);
    expect(example.SESSION_SECRET).toBe(""); expect(example.OTP_PEPPER).toBe("");
  });
});

describe("database name must match the environment", () => {
  it("requires _dev in development, _test in test, neither in production", () => {
    expect(databaseNameProblem("postgres://u:p@h/bayana_dev", "development")).toBeNull();
    expect(databaseNameProblem("postgres://u:p@h/bayana", "development")).toMatch(/ending in _dev/);
    expect(databaseNameProblem("postgres://u:p@h/bayana_test", "test")).toBeNull();
    expect(databaseNameProblem("postgres://u:p@h/bayana_dev", "test")).toMatch(/ending in _test/);
    expect(databaseNameProblem("postgres://u:p@h/bayana", "production")).toBeNull();
    expect(databaseNameProblem("postgres://u:p@h/bayana_dev", "production")).toMatch(/must not name/);
  });
  it("refusal message names the database, says nothing changed, and gives PowerShell-safe backup steps", () => {
    const message = migrationRefusal("DATABASE_URL", "bayana", "must name a database ending in _dev when NODE_ENV=development (for example bayana_dev)", "development");
    expect(message).toContain('It currently names database "bayana". Nothing was changed.');
    expect(message).toContain("pg_dump -U bayana -Fc -f /tmp/bayana.dump bayana");
    expect(message).toContain("docker cp bayana-postgres-1:/tmp/bayana.dump backups\\bayana.dump");
    expect(message).not.toMatch(/>\s*backups/); // PowerShell 5.1 '>' redirection corrupts binary dumps
    expect(message).not.toContain("postgres://");
  });
});

describe("web env messages (apps/web/scripts/check-env.ts)", () => {
  const check = (content?: string) => {
    const dir = tempDir(); const file = path.join(dir, ".env.local");
    if (content !== undefined) writeFileSync(file, content);
    const run = spawnSync(process.execPath, [tsx, path.join(repo, "apps/web/scripts/check-env.ts"), file, "apps/web/.env.local"], { cwd: path.join(repo, "apps/web"), encoding: "utf8" });
    expect(run.status).toBe(0);
    return JSON.parse(run.stdout) as { exists: boolean; problems: { name: string; rule: string }[] };
  };
  it("reports both variables as missing with an example value", () => {
    const result = check("");
    expect(result.problems).toEqual([
      { name: "NEXT_PUBLIC_API_URL", rule: "is missing; set it to the API origin with no path or trailing slash, e.g. http://localhost:4000" },
      { name: "NEXT_PUBLIC_SITE_URL", rule: "is missing; set it to this site's origin with no path or trailing slash, e.g. http://localhost:3000" }
    ]);
  });
  it("rejects a trailing slash without echoing the value", () => {
    const result = check("NEXT_PUBLIC_API_URL=http://localhost:4000/\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\n");
    expect(result.problems).toHaveLength(1); expect(result.problems[0].rule).toMatch(/^must be the API origin/); expect(JSON.stringify(result)).not.toContain("4000/");
  });
  it("passes the example file and reports a missing file", () => {
    expect(check(readFileSync(path.join(repo, "apps/web/.env.example"), "utf8")).problems).toEqual([]);
    expect(check().exists).toBe(false);
  });
});

describe("pnpm.cmd setup:env", () => {
  const sandbox = () => {
    const root = tempDir();
    for (const file of ["apps/api/.env.example", "apps/web/.env.example"]) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), readFileSync(path.join(repo, file))); }
    return root;
  };
  const run = (root: string) => spawnSync(process.execPath, [path.join(repo, "scripts/setup-env.mjs"), "--root", root, "--no-check"], { encoding: "utf8" });
  it("creates missing files, generates secrets without printing them", () => {
    const root = sandbox(); const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CREATED  apps/api/.env from apps/api/.env.example (generated random SESSION_SECRET and OTP_PEPPER)");
    expect(result.stdout).toContain("CREATED  apps/web/.env.local from apps/web/.env.example");
    const api = readFileSync(path.join(root, "apps/api/.env"), "utf8");
    const sessionSecret = /^SESSION_SECRET=(.+)$/m.exec(api)?.[1] ?? "";
    expect(sessionSecret.length).toBeGreaterThanOrEqual(32); expect(/^OTP_PEPPER=(.+)$/m.exec(api)?.[1]).not.toBe(sessionSecret);
    expect(result.stdout).not.toContain(sessionSecret);
    expect(readFileSync(path.join(root, "apps/web/.env.local"), "utf8")).toBe(readFileSync(path.join(root, "apps/web/.env.example"), "utf8"));
  });
  it("never overwrites an existing file", () => {
    const root = sandbox();
    mkdirSync(path.join(root, "apps/api"), { recursive: true });
    writeFileSync(path.join(root, "apps/api/.env"), "MINE=1\n");
    const first = run(root); const webAfterFirst = readFileSync(path.join(root, "apps/web/.env.local"), "utf8");
    writeFileSync(path.join(root, "apps/web/.env.local"), "EDITED=1\n");
    const second = run(root);
    expect(first.stdout).toContain("KEPT     apps/api/.env already exists; not changed");
    expect(second.stdout).toContain("KEPT     apps/web/.env.local already exists; not changed");
    expect(readFileSync(path.join(root, "apps/api/.env"), "utf8")).toBe("MINE=1\n");
    expect(readFileSync(path.join(root, "apps/web/.env.local"), "utf8")).toBe("EDITED=1\n");
    expect(webAfterFirst).toContain("NEXT_PUBLIC_API_URL=");
  });
});
