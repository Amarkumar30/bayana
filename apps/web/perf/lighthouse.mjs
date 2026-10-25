// pnpm.cmd perf:lighthouse — Lighthouse on the public vendor page (SPEC 18, NF): production build (`next build` +
// `next start`), real API in test mode on the _test database, a vendor created through the real API, mobile throttling.
// Lighthouse is fetched on demand (pnpm dlx), not installed: its download helpers carry advisories with no fix.
// Fails when Largest Contentful Paint is 2.5 s or more. Local only (needs Docker Postgres and Mailpit); never touches dev data.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiPort = Number(process.env.PERF_API_PORT ?? 4120), webPort = Number(process.env.PERF_WEB_PORT ?? 3400);
const api = `http://127.0.0.1:${apiPort}`, site = `http://127.0.0.1:${webPort}`, mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
const LCP_BUDGET_MS = 2500;
const database = process.env.DATABASE_URL_TEST;
if (!database || !new URL(database).pathname.endsWith("_test")) { console.error("Set DATABASE_URL_TEST to a database ending in _test (it is in apps/api/.env)."); process.exit(1); }

const children = [];
const start = (command, env) => { const child = spawn(command, { cwd: web, shell: true, env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"] }); children.push(child); return child; };
const stopAll = () => { for (const child of children) if (child.pid && child.exitCode === null) process.platform === "win32" ? spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }) : child.kill("SIGTERM"); };
process.on("exit", stopAll);
const waitFor = async (url, seconds = 180) => { for (let tries = 0; tries < seconds; tries++) { try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ } await new Promise(resolve => setTimeout(resolve, 1000)); } throw new Error(`${url} did not come up`); };
const forwardedFor = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
async function call(pathname, body, cookie, method = "POST") {
  const response = await fetch(`${api}${pathname}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor(), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status}`);
  return response;
}
async function codeFor(email, after) {
  for (let tries = 0; tries < 60; tries++) {
    const found = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Your Bayana code"`)}`)).json().catch(() => ({}));
    const code = (found.messages ?? []).filter(message => new Date(message.Created).getTime() >= after).map(message => /(\d{6})$/.exec(message.Subject)?.[1]).find(Boolean);
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`No code reached Mailpit for ${email}. Is Mailpit running (pnpm.cmd db:up)?`);
}
/** A realistic published vendor: profile, two services, hours, policies (the same steps a real vendor takes). */
async function publishedVendor() {
  const tag = randomUUID().slice(0, 8), email = `perf-${tag}@example.test`, slug = `perf-${tag}`, asked = Date.now() - 1000;
  await call("/v1/auth/otp/request", { email, purpose: "signup" });
  const cookie = (await call("/v1/auth/signup", { email, code: await codeFor(email, asked) })).headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  await call("/v1/vendor/me", { business_name: "Studio Sunday", slug, city: "Mumbai", description: "Portraits, events and small family shoots across Mumbai and Thane. Calm, unhurried sessions with edited photos in a week.", categories: ["photography"], timezone: "Asia/Kolkata" }, cookie);
  for (const [name, minutes, price] of [["Portrait session", 90, 800000], ["Family shoot", 120, 1200000]]) await call("/v1/vendor/services", { name, description: "Two outfits, one location, 30 edited photos.", price_paise: price, duration_minutes: minutes, advance_type: "PERCENT", advance_value: 25, cancellation_tiers: [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }] }, cookie);
  await call("/v1/vendor/availability/rules", { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start_time: "09:00", end_time: "18:00" })) }, cookie, "PUT");
  await call("/v1/vendor/me", { terms: "The advance confirms your date.", cancellation_policy: "Full refund until 7 days before; half until 48 hours before.", rescheduling_policy: "One free reschedule with 48 hours' notice." }, cookie, "PATCH");
  await call("/v1/vendor/publish", {}, cookie);
  return slug;
}

try {
  console.log("Starting the API (test mode, _test database)…");
  start("pnpm --filter @bayana/shared build && pnpm --filter @bayana/api migrate:test && pnpm --filter @bayana/api exec tsx src/server.ts", { NODE_ENV: "test", DATABASE_URL_TEST: database, PORT: String(apiPort), WEB_ORIGINS: site, SESSION_SECRET: randomBytes(32).toString("hex"), PAYMENT_MODE: "disabled", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "", EMAIL_TRANSPORT: "smtp", SMTP_URL: process.env.E2E_SMTP_URL ?? "smtp://127.0.0.1:1025", EMAIL_FROM: "Bayana Perf <perf@bayana.local>", TRUST_PROXY: "1" });
  await waitFor(`${api}/health`);
  const slug = await publishedVendor();
  console.log(`Vendor /${slug} published. Building the web app (production)…`);
  const webEnv = { NEXT_PUBLIC_API_URL: api, NEXT_PUBLIC_SITE_URL: site, NEXT_PUBLIC_RAZORPAY_KEY_ID: "", NEXT_TELEMETRY_DISABLED: "1" };
  const build = spawnSync("pnpm exec next build", { cwd: web, shell: true, env: { ...process.env, ...webEnv }, stdio: ["ignore", "ignore", "inherit"] });
  if (build.status !== 0) throw new Error("next build failed");
  start(`pnpm exec next start --port ${webPort}`, webEnv);
  await waitFor(`${site}/pricing`);
  // The first request renders and caches the page (ISR); real visitors get the cached copy, so measure that.
  for (let warm = 0; warm < 3; warm++) await fetch(`${site}/${slug}`);
  // PERF_KEEP=1 leaves both servers running for manual investigation (stop them with Ctrl+C).
  if (process.env.PERF_KEEP === "1") { console.log(`Servers kept running: ${site}/${slug}`); await new Promise(() => {}); }
  // "devtools" applies slow 4G and a 4x CPU slowdown to a real page load and measures it; "simulate" (Lighthouse's
  // default) estimates the same conditions from an unthrottled load and counts all script work before the paint, so it
  // reads higher for a page whose first paint already is its largest paint. The budget is checked on the measured value
  // (median of three runs); the estimate is always printed next to it.
  const lighthouse = method => {
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), "bayana-lighthouse-")), "report.json");
    const run = spawnSync(`pnpm dlx lighthouse@12.6.1 "${site}/${slug}" --quiet --output=json --output-path="${out}" --only-categories=performance,accessibility,best-practices,seo --throttling-method=${method} --chrome-path="${chromium.executablePath()}" --chrome-flags="--headless=new --no-sandbox"`, { cwd: web, shell: true, stdio: ["ignore", "ignore", "inherit"] });
    if (run.status !== 0) throw new Error("Lighthouse failed to run");
    const report = JSON.parse(readFileSync(out, "utf8"));
    const audit = name => report.audits[name], score = name => Math.round((report.categories[name]?.score ?? 0) * 100);
    console.log(`  ${method.padEnd(8)} performance ${score("performance")}, accessibility ${score("accessibility")}, best practices ${score("best-practices")}, SEO ${score("seo")} | LCP ${audit("largest-contentful-paint").displayValue}, FCP ${audit("first-contentful-paint").displayValue}, TBT ${audit("total-blocking-time").displayValue}, CLS ${audit("cumulative-layout-shift").displayValue} | ${out}`);
    return audit("largest-contentful-paint").numericValue;
  };
  console.log("Running Lighthouse on mobile (slow 4G, 4x CPU slowdown): three measured runs, then the simulated estimate…");
  const measured = [lighthouse("devtools"), lighthouse("devtools"), lighthouse("devtools")].sort((a, b) => a - b);
  const estimate = lighthouse("simulate");
  const lcp = measured[1];
  console.log(`\nLCP measured under throttling (median of 3): ${Math.round(lcp)} ms. Simulated estimate: ${Math.round(estimate)} ms.`);
  if (lcp >= LCP_BUDGET_MS) { console.error(`FAIL: LCP ${Math.round(lcp)} ms is not under ${LCP_BUDGET_MS} ms.`); process.exitCode = 1; }
  else console.log(`PASS: LCP ${Math.round(lcp)} ms is under ${LCP_BUDGET_MS} ms.${estimate >= LCP_BUDGET_MS ? ` Note: the simulated estimate (${Math.round(estimate)} ms) is above the budget.` : ""}`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { stopAll(); }
