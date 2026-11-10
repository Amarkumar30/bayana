import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { vendorShareLinks } from "@bayana/shared";

// Every absolute URL the API hands out is built on SITE_URL. Here SITE_URL is deliberately NOT the first WEB_ORIGINS entry, so a
// link still built from WEB_ORIGINS[0] (or any other origin) fails these tests. Set before src/config.js loads.
const env = vi.hoisted(() => {
  const site = "https://site-url.integration.test";
  const saved = { SITE_URL: process.env.SITE_URL, WEB_ORIGINS: process.env.WEB_ORIGINS };
  process.env.SITE_URL = site;
  process.env.WEB_ORIGINS = `${process.env.WEB_ORIGINS || process.env.WEB_ORIGIN || "http://localhost:3000"},${site}`;
  return { site, saved };
});

const { app } = await import("../../src/app.js");
const { startSession } = await import("../../src/auth.js");
const { acceptTerms, createHold } = await import("../../src/booking-service.js");
const { config } = await import("../../src/config.js");
const { loadContract } = await import("../../src/contract.js");
const { pool, transaction } = await import("../../src/database.js");
const { createUser } = await import("../helpers.js");

const SITE = env.site;
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve())); await pool.end();
  for (const [name, value] of Object.entries(env.saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
});

const ip = () => `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
async function call(method: string, path: string, cookie?: string) {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...(cookie ? { cookie } : {}) }, body: method === "GET" ? undefined : "{}" });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = JSON.parse(text); } catch { body = {}; }
  return { status: response.status, location: response.headers.get("location") ?? "", text, body };
}
/** Every http(s) URL in a text, so a stray origin anywhere is caught, not just in the one link we look for. */
const urlsIn = (text: string) => text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
/** URLs that point at a Bayana page: anything but mailto-like or third-party hosts the templates may name. */
const siteLinks = (text: string) => urlsIn(text).filter(url => !/^https?:\/\/(wa\.me|www\.w3\.org)\b/.test(url));

const day = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
async function publishedVendor() {
  const owner = await createUser(pool); const vendorId = randomUUID(), serviceId = randomUUID(), slug = `site-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms) VALUES($1,$2,$3,'Site URL Studio','Delhi','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms the date.')", [vendorId, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Session',100000,60,'hourly','PERCENT',20)", [serviceId, vendorId]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), vendorId, weekday]);
  return { vendorId, serviceId, slug, cookie: `bayana_session=${await transaction(db => startSession(db, owner.id))}` };
}

describe("every absolute URL uses the configured SITE_URL", () => {
  it("the test really configures a SITE_URL that differs from the first WEB_ORIGINS entry", () => {
    expect(config.SITE_URL).toBe(SITE);
    expect(config.WEB_ORIGINS[0]).not.toBe(SITE);
  });

  it("share URL: the vendor's own profile and the public page give SITE_URL/<slug>, the same URL the share card, WhatsApp and QR use", async () => {
    const v = await publishedVendor();
    const me = await call("GET", "/v1/vendor/me", v.cookie);
    expect(me.status).toBe(200);
    expect(me.body.page_url).toBe(`${SITE}/${v.slug}`);
    const page = await call("GET", `/v1/vendors/${v.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.page_url).toBe(`${SITE}/${v.slug}`);
    const links = vendorShareLinks(config.SITE_URL, v.slug);
    expect([links.url, links.qrTarget]).toEqual([me.body.page_url, me.body.page_url]);
    expect(decodeURIComponent(links.whatsapp("Site URL Studio"))).toContain(me.body.page_url);
  });

  it("email links: the hold, request and confirmation emails link to SITE_URL/b/<id> and to no other origin", async () => {
    const v = await publishedVendor(); const customer = await createUser(pool, { role: "CLIENT" });
    const booking = await transaction(db => createHold(db, { slug: v.slug, date: day, name: "Asha Rao", phone: "+919800000000", email: customer.email, clientUserId: customer.id, serviceId: v.serviceId, startsAt: `${day}T05:30:00.000Z`, key: randomUUID() }));
    const contract = await loadContract(pool, booking.id);
    await transaction(db => acceptTerms(db, { bookingId: booking.id, termsHash: contract!.sha256, email: customer.email, ip: "203.0.113.9", userAgent: "vitest" }));
    const emails = (await pool.query<{ template: string; text_body: string; html_body: string | null }>("SELECT template,text_body,html_body FROM email_outbox WHERE booking_id=$1 ORDER BY created_at", [booking.id])).rows;
    expect(emails.map(email => email.template)).toContain("hold_started");
    const customerLinks = emails.filter(email => email.template === "hold_started").flatMap(email => siteLinks(`${email.text_body}\n${email.html_body ?? ""}`));
    expect(customerLinks.some(url => url.startsWith(`${SITE}/b/${booking.id}?t=`))).toBe(true);
    for (const email of emails) {
      const body = `${email.text_body}\n${email.html_body ?? ""}`;
      for (const url of siteLinks(body)) expect(url.startsWith(`${SITE}/`), `${email.template}: ${url}`).toBe(true);
      expect(body, email.template).not.toContain(config.WEB_ORIGINS[0]);
    }
  });

  it("calendar feed: each booking links to SITE_URL/dashboard/bookings/<id>", async () => {
    const v = await publishedVendor(); const customer = await createUser(pool, { role: "CLIENT" });
    const booking = await transaction(db => createHold(db, { slug: v.slug, date: day, name: "Asha Rao", phone: "+919800000000", email: customer.email, clientUserId: customer.id, serviceId: v.serviceId, startsAt: `${day}T06:30:00.000Z`, key: randomUUID() }));
    const contract = await loadContract(pool, booking.id);
    await transaction(db => acceptTerms(db, { bookingId: booking.id, termsHash: contract!.sha256, email: customer.email, ip: "203.0.113.9", userAgent: "vitest" }));
    const path = (await call("POST", "/v1/vendor/settings/ical", v.cookie)).body.path as string;
    const feed = (await call("GET", path)).text.replace(/\r\n /g, "");
    expect(feed).toContain(`URL:${SITE}/dashboard/bookings/${booking.id}`);
    for (const url of urlsIn(feed)) expect(url.startsWith(`${SITE}/`), url).toBe(true);
  });

  it("Google return: a failed sign-in and a refused customer start both land on SITE_URL", async () => {
    const callback = await call("GET", "/v1/auth/google/callback");
    expect(callback.status).toBe(302);
    expect(callback.location).toMatch(new RegExp(`^${SITE.replace(/\./g, "\\.")}/login\\?error=google_`));
    // mode=link is never allowed for a customer, so this fails back to the booking whether or not Google is configured.
    const customer = await call("GET", "/v1/auth/google/start?intent=customer&mode=link&next=%2Fsome-studio%2Fbook%3Fgoogle%3D1");
    expect(customer.status).toBe(302);
    expect(customer.location.startsWith(`${SITE}/some-studio/book?`)).toBe(true);
    expect(new URL(customer.location).searchParams.get("google_error")).toMatch(/^google_/);
  });
});
