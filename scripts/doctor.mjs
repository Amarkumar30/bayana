// pnpm.cmd doctor — read-only health check of the local setup. Prints PASS or FAIL per check with the fix. Never prints secret values.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnvFile, envFiles } from "./env-files.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const results = [];
const report = (ok, name, detail, fix) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}${!ok && fix ? `\n      Fix: ${fix}` : ""}`); };

// 1. Toolchain
const nodeMajor = Number(process.versions.node.split(".")[0]);
report(nodeMajor >= 22, "Node.js", `v${process.versions.node}`, "Install Node 22 LTS from https://nodejs.org and reopen PowerShell.");
const wantedPnpm = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).packageManager?.split("@")[1] ?? "10";
const agent = /pnpm\/(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent ?? "")?.[1];
const pnpmVersion = agent ?? spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).stdout?.trim();
report(Boolean(pnpmVersion) && pnpmVersion.split(".")[0] === wantedPnpm.split(".")[0], "pnpm", pnpmVersion ? `${pnpmVersion} (project uses ${wantedPnpm})` : "not found", `Run: corepack enable; corepack prepare pnpm@${wantedPnpm} --activate`);

// 2. Env files (validated with the apps' own rules; names only)
const apiEnv = {};
for (const entry of envFiles) {
  const result = checkEnvFile(root, entry);
  if (!result.exists) { report(false, `${entry.target}`, "missing", "Run: pnpm.cmd setup:env"); continue; }
  report(result.problems.length === 0, `${entry.target}`, result.problems.length ? `${result.problems.length} problem(s): ${result.problems.map(problem => problem.name).join(", ")}` : "all variables valid",
    result.problems.map(problem => `\n        ${problem.name} ${problem.rule}`).join("") + `\n        Edit ${entry.target}; compare with ${entry.example}.`);
  if (entry.app === "api") Object.assign(apiEnv, require("dotenv").parse(readFileSync(path.join(root, entry.target))));
}

// 3. Database
const fallback = Object.fromEntries(readFileSync(path.join(root, "apps/api/.env.example"), "utf8").split(/\r?\n/).map(line => /^([A-Z0-9_]+)=(.*)$/.exec(line)).filter(Boolean).map(match => [match[1], match[2]]));
const urlFor = name => { try { return new URL(apiEnv[name] || fallback[name]); } catch { return null; } };
const devUrl = urlFor("DATABASE_URL"), testUrl = urlFor("DATABASE_URL_TEST");
const { Client } = require("pg");
const withDatabase = async (url, database, fn) => { const target = new URL(url); target.pathname = `/${database}`; const client = new Client({ connectionString: target.toString(), connectionTimeoutMillis: 3000 }); await client.connect(); try { return await fn(client); } finally { await client.end(); } };
let databases = null;
if (devUrl) {
  try { databases = await withDatabase(devUrl, "postgres", async client => (await client.query("SELECT datname FROM pg_database")).rows.map(row => row.datname)); report(true, "Database server", `reachable at ${devUrl.hostname}:${devUrl.port || 5432}`); }
  catch (error) { report(false, "Database server", `not reachable at ${devUrl.hostname}:${devUrl.port || 5432} (${error.code ?? error.message})`, "Start Docker Desktop, then run: pnpm.cmd db:up"); }
} else report(false, "Database server", "DATABASE_URL is not a valid URL", "Fix DATABASE_URL in apps/api/.env.");

const sqlFiles = readdirSync(path.join(root, "apps/api/sql")).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
for (const [label, url, suffix] of [["Development database", devUrl, "_dev"], ["Test database", testUrl, "_test"]]) {
  if (!databases || !url) continue;
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name.endsWith(suffix)) { report(false, label, `"${name}" does not end in ${suffix}`, `Point ${suffix === "_dev" ? "DATABASE_URL" : "DATABASE_URL_TEST"} in apps/api/.env at a database ending in ${suffix} (see pnpm.cmd db:migrate for how to move existing data).`); continue; }
  if (!databases.includes(name)) { report(false, label, `"${name}" does not exist`, "Run: pnpm.cmd db:create"); continue; }
  const applied = await withDatabase(url, name, async client => (await client.query("SELECT to_regclass('schema_migrations') AS t")).rows[0].t ? (await client.query("SELECT name FROM schema_migrations")).rows.map(row => row.name) : []);
  const pending = sqlFiles.filter(file => !applied.includes(file));
  report(pending.length === 0, `${label} migrations`, `"${name}": ${pending.length ? `${pending.length} pending (${pending.join(", ")})` : "up to date"}`, suffix === "_dev" ? "Back up first, then run: pnpm.cmd db:migrate" : "Run: pnpm.cmd db:migrate:test");
}

// 4. Ports
const portFree = port => new Promise(resolve => { const server = net.createServer().once("error", () => resolve(false)).once("listening", () => server.close(() => resolve(true))); server.listen(port); });
for (const [label, port] of [["API port", Number(apiEnv.PORT || 4000)], ["Web port", 3000]]) {
  const free = await portFree(port);
  report(free, label, `${port} ${free ? "is free" : "is in use"}`, `Stop whatever uses it. Find it with: Get-NetTCPConnection -LocalPort ${port} | Select-Object OwningProcess`);
}

const failures = results.filter(ok => !ok).length;
console.log(`\n${failures ? `${failures} check(s) failed.` : "All checks passed."}`);
process.exitCode = failures ? 1 : 0;
if (!existsSync(path.join(root, "node_modules"))) console.log("Note: run pnpm.cmd install first.");
