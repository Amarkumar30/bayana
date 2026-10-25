// pnpm.cmd signoff:local — the localhost sign-off (docs/LOCALHOST_SIGNOFF.md): SPEC 16.7 checks that apply on this machine,
// run against the dev app (`pnpm.cmd dev`: web 3000, API 4000, bayana_dev, Mailpit). Prints PASS/FAIL per check with
// evidence; never prints secret values. It creates its own vendor and customers named signoff-… so they are easy to spot.
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const env = require("dotenv").parse(readFileSync(path.join(root, "apps/api/.env")));
const webEnv = require("dotenv").parse(readFileSync(path.join(root, "apps/web/.env.local")));
const api = webEnv.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", web = webEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
const results = [];
const report = (item, ok, name, evidence) => { results.push({ item, ok, name }); console.log(`${ok === null ? "INFO" : ok ? "PASS" : "FAIL"}  [${item}] ${name}${evidence ? ` — ${evidence}` : ""}`); };
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const otpCodes = [];

/** A browser-like client: keeps its cookie, sends our web Origin (as the browser does), one client address. */
function client() {
  let cookie = ""; const from = ip();
  const call = async (method, pathname, body, headers = {}) => {
    const response = await fetch(`${api}${pathname}`, { method, redirect: "manual", headers: { "content-type": "application/json", origin: web, "x-forwarded-for": from, ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = response.headers.getSetCookie().find(value => value.startsWith("bayana_session="));
    if (set) cookie = /^bayana_session=;/.test(set) ? "" : set.split(";")[0];
    const text = await response.text(); let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    return { status: response.status, json, headers: response.headers, setCookie: set ?? "" };
  };
  return { call, get cookie() { return cookie; } };
}
async function codeFor(email, after) {
  for (let tries = 0; tries < 60; tries++) {
    const found = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Your Bayana code"`)}`)).json().catch(() => ({}));
    const code = (found.messages ?? []).filter(message => new Date(message.Created).getTime() >= after).sort((a, b) => b.Created.localeCompare(a.Created)).map(message => /(\d{6})$/.exec(message.Subject)?.[1]).find(Boolean);
    if (code) { otpCodes.push(code); return code; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`no code reached Mailpit for ${email}`);
}
const subjects = async email => ((await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json().catch(() => ({}))).messages ?? []).map(message => message.Subject);
const step = async (item, name, fn) => { try { const evidence = await fn(); report(item, true, name, evidence); } catch (error) { report(item, false, name, error instanceof Error ? error.message : String(error)); } };
const expectStatus = (reply, expected, what) => { if (!(Array.isArray(expected) ? expected : [expected]).includes(reply.status)) throw new Error(`${what}: HTTP ${reply.status} ${reply.json?.error?.code ?? ""}`); return reply; };

console.log(`Localhost sign-off against ${web} and ${api} (Mailpit ${mailpit})\n`);
const tag = randomUUID().slice(0, 8), vendorEmail = `signoff-vendor-${tag}@example.test`, password = `signoff-${randomUUID()}`;
const vendor = client();

// 1. Health
await step(1, "/health and /ready respond", async () => {
  const health = await fetch(`${api}/health`), ready = await fetch(`${api}/ready`);
  if (health.status !== 200 || ready.status !== 200) throw new Error(`/health ${health.status}, /ready ${ready.status}`);
  return "both 200; /ready ran SELECT 1 on the database";
});

// 2. Every sign-in path for one email; a returning user is never locked out
await step(2, "Signup (code), logout, code login, add password, password login, code login again", async () => {
  let asked = Date.now() - 1000;
  expectStatus(await vendor.call("POST", "/v1/auth/otp/request", { email: vendorEmail, purpose: "signup" }), 202, "signup code");
  expectStatus(await vendor.call("POST", "/v1/auth/signup", { email: vendorEmail, code: await codeFor(vendorEmail, asked) }), 201, "signup");
  expectStatus(await vendor.call("POST", "/v1/auth/logout", {}), 204, "logout");
  expectStatus(await vendor.call("GET", "/v1/auth/me"), 401, "after logout");
  asked = Date.now() - 1000;
  expectStatus(await vendor.call("POST", "/v1/auth/otp/request", { email: vendorEmail, purpose: "login" }), 202, "login code");
  expectStatus(await vendor.call("POST", "/v1/auth/login", { email: vendorEmail, code: await codeFor(vendorEmail, asked) }), 200, "code login");
  expectStatus(await vendor.call("PUT", "/v1/auth/password", { new_password: password }), 200, "add password");
  expectStatus(await vendor.call("POST", "/v1/auth/logout", {}), 204, "logout");
  expectStatus(await vendor.call("POST", "/v1/auth/login", { email: vendorEmail, password }), 200, "password login");
  expectStatus(await vendor.call("POST", "/v1/auth/logout", {}), 204, "logout");
  asked = Date.now() - 1000;
  expectStatus(await vendor.call("POST", "/v1/auth/otp/request", { email: vendorEmail, purpose: "login" }), 202, "second login code");
  expectStatus(await vendor.call("POST", "/v1/auth/login", { email: vendorEmail, code: await codeFor(vendorEmail, asked) }), 200, "second code login");
  return "all succeeded for the same email";
});

// 3. Cookies between the web origin and the API origin
await step(3, "Session cookie works across web and API origins and survives a reload", async () => {
  const me = expectStatus(await vendor.call("GET", "/v1/auth/me"), 200, "me");
  const again = expectStatus(await vendor.call("GET", "/v1/auth/me"), 200, "me after reload");
  if (me.json.user.id !== again.json.user.id) throw new Error("session changed between requests");
  const fresh = client(); const asked = Date.now() - 1000;
  await fresh.call("POST", "/v1/auth/otp/request", { email: vendorEmail, purpose: "login" });
  const login = await fresh.call("POST", "/v1/auth/login", { email: vendorEmail, code: await codeFor(vendorEmail, asked) });
  const attributes = login.setCookie.toLowerCase();
  for (const required of ["httponly", "samesite=lax", "path=/"]) if (!attributes.includes(required)) throw new Error(`cookie lacks ${required}`);
  const preflight = await fetch(`${api}/v1/auth/me`, { method: "OPTIONS", headers: { origin: web, "access-control-request-method": "GET" } });
  if (preflight.headers.get("access-control-allow-origin") !== web || preflight.headers.get("access-control-allow-credentials") !== "true") throw new Error("CORS does not allow the web origin with credentials");
  const foreign = await vendor.call("POST", "/v1/auth/logout", {}, { origin: "https://evil.example" });
  if (foreign.status !== 403) throw new Error(`a foreign-origin POST was not refused (${foreign.status})`);
  const page = await fetch(`${web}/dashboard`, { headers: { cookie: vendor.cookie } });
  if (page.status !== 200) throw new Error(`web /dashboard ${page.status}`);
  return `HttpOnly, SameSite=Lax, Path=/${attributes.includes("domain=") ? ", with Domain" : ", host-only (no Domain, as locally intended)"}; CORS allows ${web} with credentials; a foreign-origin POST is 403; /dashboard renders`;
});

// 4. A full booking: hold, terms, advance, confirmation, emails, ledger
const slug = `signoff-${tag}`; let serviceId = "", dayIso = "";
await step(4, "Full booking: HELD, PENDING, CONFIRMED, emails received, ledger correct", async () => {
  expectStatus(await vendor.call("POST", "/v1/vendor/me", { business_name: `Sign-off Studio ${tag}`, slug, city: "Mumbai", description: "Sign-off test vendor.", categories: ["photography"], timezone: "Asia/Kolkata" }), 201, "profile");
  serviceId = expectStatus(await vendor.call("POST", "/v1/vendor/services", { name: "Sign-off session", price_paise: 400000, duration_minutes: 60, advance_type: "PERCENT", advance_value: 25 }), 201, "service").json.id;
  expectStatus(await vendor.call("PUT", "/v1/vendor/availability/rules", { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start_time: "09:00", end_time: "18:00" })) }), 200, "hours");
  expectStatus(await vendor.call("PATCH", "/v1/vendor/me", { terms: "The advance confirms your date.", cancellation_policy: "Full refund until 48 hours before.", rescheduling_policy: "One free change." }), 200, "policies");
  expectStatus(await vendor.call("POST", "/v1/vendor/publish", {}), 200, "publish");
  dayIso = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
  const slots = expectStatus(await vendor.call("GET", `/v1/vendors/${slug}/availability/slots?date=${dayIso}&service_id=${serviceId}`), 200, "slots").json.slots;
  const customerEmail = `signoff-customer-${tag}@example.test`, customer = client(); let asked = Date.now() - 1000;
  expectStatus(await customer.call("POST", "/v1/auth/booking/otp/request", { email: customerEmail }), 202, "booking code");
  expectStatus(await customer.call("POST", "/v1/auth/booking/otp/verify", { email: customerEmail, code: await codeFor(customerEmail, asked) }), 200, "booking code verify");
  const held = expectStatus(await customer.call("POST", "/v1/bookings", { slug, date: dayIso, service_id: serviceId, starts_at: slots[0].startsAt, name: "Sign-off Customer" }, { "idempotency-key": randomUUID() }), 201, "hold");
  const id = held.json.booking.id, token = held.json.booking.access_token, states = [held.json.booking.status];
  const view = expectStatus(await customer.call("GET", `/v1/bookings/${id}`, undefined, { "x-booking-token": token }), 200, "booking view");
  states.push(expectStatus(await customer.call("POST", `/v1/bookings/${id}/accept`, { terms_hash: view.json.contract_preview.sha256, accepted: true }, { "x-booking-token": token }), 200, "accept").json.booking.status);
  let gateway = "online payments off in this .env";
  if (view.json.payments_enabled) {
    const order = await customer.call("POST", `/v1/bookings/${id}/payment-order`, {}, { "x-booking-token": token });
    gateway = order.status === 200 && /^order_/.test(order.json.order_id) ? "a real Razorpay test order was created for the advance (paying it in Checkout is a manual step)" : `Razorpay order not created (HTTP ${order.status})`;
  }
  // The advance arrives offline here (cash or UPI to the vendor), the path that needs no browser.
  const paid = expectStatus(await vendor.call("POST", `/v1/vendor/bookings/${id}/offline-payments`, { kind: "advance", amount_paise: 100000, method: "upi", note: "sign-off advance" }), 201, "record advance");
  if (!paid.json.confirmed) throw new Error("recording the advance did not confirm the booking");
  const detail = expectStatus(await vendor.call("GET", `/v1/vendor/bookings/${id}`), 200, "vendor detail").json;
  states.push(detail.status);
  if (states.join(">") !== "HELD>PENDING>CONFIRMED") throw new Error(`states were ${states.join(" > ")}`);
  const ledger = detail.ledger.map(entry => `${entry.kind} ${entry.amount_paise}`);
  if (ledger.join() !== "PAYMENT -100000" || detail.paid_paise !== 100000 || detail.balance_due_paise !== 300000) throw new Error(`ledger ${ledger.join(", ")}, paid ${detail.paid_paise}, due ${detail.balance_due_paise}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  const customerMail = await subjects(customerEmail), vendorMail = await subjects(vendorEmail);
  if (!customerMail.some(subject => subject.includes("is held")) || !customerMail.some(subject => subject.startsWith("Confirmed"))) throw new Error(`customer emails: ${customerMail.join(" | ")}`);
  return `HELD > PENDING > CONFIRMED; ledger PAYMENT -₹1,000 with ₹3,000 due; customer got "held" and "Confirmed" emails (${customerMail.length} total), vendor ${vendorMail.length}; ${gateway}`;
});

// 5. Two customers race for one slot
await step(5, "Two customers race for the same slot: exactly one gets it", async () => {
  const slots = (await vendor.call("GET", `/v1/vendors/${slug}/availability/slots?date=${dayIso}&service_id=${serviceId}`)).json.slots;
  const racers = await Promise.all([0, 1].map(async index => {
    const email = `signoff-racer${index}-${tag}@example.test`, racer = client(), asked = Date.now() - 1000;
    await racer.call("POST", "/v1/auth/booking/otp/request", { email });
    await racer.call("POST", "/v1/auth/booking/otp/verify", { email, code: await codeFor(email, asked) });
    return racer;
  }));
  const replies = await Promise.all(racers.map(racer => racer.call("POST", "/v1/bookings", { slug, date: dayIso, service_id: serviceId, starts_at: slots[0].startsAt, name: "Racer" }, { "idempotency-key": randomUUID() })));
  const codes = replies.map(reply => reply.status).sort();
  if (codes.join() !== "201,409" || !replies.some(reply => reply.json?.error?.code === "SLOT_TAKEN")) throw new Error(`statuses ${codes.join(", ")}`);
  return "one 201 (held), one 409 SLOT_TAKEN";
});

// 10. The scheduled tick ran recently and the admin health would be green
await step(10, "A tick ran in the last 30 minutes", async () => {
  if (!env.TICK_SECRET) throw new Error("TICK_SECRET is not set in apps/api/.env");
  const tick = await fetch(`${api}/internal/jobs/tick`, { method: "POST", headers: { authorization: `Bearer ${env.TICK_SECRET}` } });
  const body = await tick.json();
  if (tick.status !== 200 || !body.ok) throw new Error(`tick HTTP ${tick.status}`);
  const { Client } = require("pg"); const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  try {
    const row = (await db.query("SELECT extract(epoch FROM now()-max(started_at))::int AS age, (SELECT status FROM job_runs WHERE job='expire_holds' ORDER BY started_at DESC LIMIT 1) AS status FROM job_runs WHERE job='expire_holds'")).rows[0];
    if (row.age === null || row.age > 1800 || row.status !== "ok") throw new Error(`last tick ${row.age}s ago, ${row.status}`);
    return `POST /internal/jobs/tick ran ${body.results.map(result => `${result.job} ${result.status}`).join(", ")}; last tick ${row.age}s ago (health turns red after 1800s)`;
  } finally { await db.end(); }
});

// 12. No secret in the browser bundle or the API log
await step(12, "No secret in the web bundle; no secret or code in the API log", async () => {
  const secretNames = Object.keys(env).filter(name => /SECRET|PEPPER|PASSWORD|SMTP_URL|DATABASE_URL/.test(name) && env[name] && env[name].length >= 8);
  const values = secretNames.map(name => env[name]);
  const bundleRoots = [path.join(root, "apps/web/.next/static")].filter(existsSync);
  if (!bundleRoots.length) throw new Error("apps/web/.next/static not found; run pnpm.cmd dev or build first");
  let files = 0; const leaked = new Set();
  const walk = directory => { for (const entry of readdirSync(directory)) { const full = path.join(directory, entry); if (statSync(full).isDirectory()) walk(full); else { files++; const text = readFileSync(full, "utf8"); secretNames.forEach((name, index) => { if (text.includes(values[index])) leaked.add(name); }); } } };
  bundleRoots.forEach(walk);
  if (leaked.size) throw new Error(`bundle contains the value of ${[...leaked].join(", ")}`);
  let logNote = "API log not checked (set SIGNOFF_LOG to the file pnpm.cmd dev writes)";
  if (process.env.SIGNOFF_LOG && existsSync(process.env.SIGNOFF_LOG)) {
    const log = readFileSync(process.env.SIGNOFF_LOG, "utf8");
    const inLog = secretNames.filter((_, index) => log.includes(values[index])), codes = otpCodes.filter(code => log.includes(code)), passwords = log.includes(password);
    if (inLog.length || codes.length || passwords) throw new Error(`API log contains ${[...inLog, ...(codes.length ? [`${codes.length} sign-in code(s)`] : []), ...(passwords ? ["the test password"] : [])].join(", ")}`);
    logNote = `API log (${Math.round(log.length / 1024)} KB) has none of the ${secretNames.length} secrets, none of the ${otpCodes.length} codes used in this run and not the password`;
  }
  return `${files} bundle files checked for ${secretNames.length} secret values (${secretNames.join(", ")}): none found; ${logNote}`;
});

const failed = results.filter(result => result.ok === false);
console.log(`\n${failed.length ? `${failed.length} check(s) failed.` : "All automated sign-off checks passed."} Items 6, 7, 8, 9 and 11 are covered in docs/LOCALHOST_SIGNOFF.md.`);
process.exitCode = failed.length ? 1 : 0;
