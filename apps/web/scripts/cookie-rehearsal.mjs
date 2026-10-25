// pnpm.cmd --filter @bayana/web test:cookies
// Cookie rehearsal (SPEC 16.7 check 3) with production cookie settings on local hostnames, no hosts file and no TLS:
//   browser  http://app.localtest.me:3200  (a small stand-in for the web server, using lib/session-forward.ts)
//   browser  http://api.localtest.me:4100  (the real API image: NODE_ENV=production, SESSION_COOKIE_DOMAIN=.localtest.me)
// Chromium maps *.localtest.me to 127.0.0.1 and treats both origins as secure, so the Secure cookie behaves as on HTTPS.
// It proves: the API's session cookie is HttpOnly, Secure, SameSite=Lax with Domain=.localtest.me; the web host receives it
// on navigation; the web server forwards it to the API (GET /v1/auth/me answers 200 as that user); another site never gets it.
// Prerequisites and the docker run command: docs/DEPLOY.md, "Cookie rehearsal". Codes are read from Mailpit, then deleted.
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { fetchWithSession, SESSION_COOKIE } from "../lib/session-forward.ts";

const APP_PORT = Number(process.env.REHEARSAL_APP_PORT ?? 3200);
const APP = `http://app.localtest.me:${APP_PORT}`;
const OTHER = `http://other-site.test:${APP_PORT}`;
const API = process.env.REHEARSAL_API_URL ?? "http://api.localtest.me:4100";
const API_INTERNAL = process.env.REHEARSAL_API_INTERNAL_URL ?? "http://127.0.0.1:4100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const email = `cookie-rehearsal-${Date.now().toString(36)}@example.test`;

const results = [];
const check = (ok, name, detail = "") => { results.push(ok); process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}\n`); };
const parseCookies = header => Object.fromEntries((header ?? "").split(";").map(part => part.trim().split("=")).filter(([name]) => name).map(([name, ...rest]) => [name, rest.join("=")]));

// The stand-in web server: /server-me does what a Server Component does with lib/server-api.ts.
const app = createServer(async (req, res) => {
  if (req.url === "/server-me") {
    const cookies = parseCookies(req.headers.cookie);
    const response = await fetchWithSession(API_INTERNAL, "/v1/auth/me", { get: name => name in cookies ? { value: cookies[name] } : undefined });
    const body = await response.json().catch(() => null);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ webReceivedSession: SESSION_COOKIE in cookies, apiStatus: response.status, email: body?.user?.email ?? null }));
    return;
  }
  res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>rehearsal</title>");
});
await new Promise(resolve => app.listen(APP_PORT, "127.0.0.1", resolve));

// channel "chromium" (full browser, new headless): the lightweight headless shell ignores the treat-as-secure flag.
const browser = await chromium.launch({ channel: "chromium", args: ["--host-resolver-rules=MAP *.localtest.me 127.0.0.1, MAP other-site.test 127.0.0.1", `--unsafely-treat-insecure-origin-as-secure=${APP},${API},${OTHER}`] });
let mailId;
try {
  const health = await fetch(`${API_INTERNAL}/health`).then(response => response.ok, () => false);
  if (!health) throw new Error(`The API is not answering on ${API_INTERNAL}. Start the rehearsal container first (docs/DEPLOY.md).`);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${APP}/`);

  const call = (path, body) => page.evaluate(async ([url, payload]) => { const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); return r.status; }, [`${API}${path}`, body]);
  check(await call("/v1/auth/otp/request", { email, purpose: "signup" }) === 202, "browser on the web origin can call the API cross-origin (CORS with credentials)");

  let code;
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    const found = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(response => response.json());
    mailId = found.messages?.[0]?.ID;
    if (mailId) code = (await fetch(`${MAILPIT}/api/v1/message/${mailId}`).then(response => response.json())).Text.match(/\b\d{6}\b/)?.[0];
    if (!code) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!code) throw new Error("No signup code arrived in Mailpit. Is Mailpit running and the API's SMTP_URL pointing at it?");
  check(await call("/v1/auth/signup", { email, code, password: `Rehearsal-${Date.now()}-pass` }) === 201, "signup sets a session");

  const session = (await context.cookies()).find(cookie => cookie.name === SESSION_COOKIE);
  check(session?.domain === ".localtest.me", "cookie Domain is the shared parent domain", session?.domain);
  check(session?.httpOnly === true && session?.secure === true && session?.sameSite === "Lax", "cookie is HttpOnly, Secure, SameSite=Lax");
  check(!(await page.evaluate(() => document.cookie)).includes(SESSION_COOKIE), "page scripts cannot read the session cookie");

  await page.goto(`${APP}/server-me`);
  const forwarded = JSON.parse(await page.locator("body").innerText());
  check(forwarded.webReceivedSession, "the web host receives the cookie on navigation");
  check(forwarded.apiStatus === 200 && forwarded.email === email, "the web server forwards it and the API answers as the user", `status ${forwarded.apiStatus}`);

  await page.reload();
  check(JSON.parse(await page.locator("body").innerText()).apiStatus === 200, "session survives a reload");

  await page.goto(`${OTHER}/server-me`);
  const other = JSON.parse(await page.locator("body").innerText());
  check(!other.webReceivedSession && other.apiStatus === 401, "another site never receives the cookie", `status ${other.apiStatus}`);

  await page.goto(`${APP}/`);
  check(await call("/v1/auth/logout", {}) === 204, "logout");
  await page.goto(`${APP}/server-me`);
  check(JSON.parse(await page.locator("body").innerText()).apiStatus === 401, "after logout the forwarded cookie no longer works");
} catch (error) {
  check(false, "rehearsal", error instanceof Error ? error.message : String(error));
} finally {
  if (mailId) await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [mailId] }) }).catch(() => undefined);
  await browser.close();
  app.close();
}
process.exitCode = results.length && results.every(Boolean) ? 0 : 1;
