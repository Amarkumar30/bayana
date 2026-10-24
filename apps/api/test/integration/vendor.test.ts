import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { pool, transaction } from "../../src/database.js";
import { vendorRouter } from "../../src/vendor-routes.js";

let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; text: string; body: Record<string, any> };
async function call(cookie: string | null, method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : {} };
}
async function account(role: "VENDOR" | "CLIENT" = "VENDOR") {
  const id = randomUUID(); await pool.query("INSERT INTO users(id,email,role,email_verified_at) VALUES($1,$2,$3,now())", [id, `${role.toLowerCase()}-${id.slice(0, 8)}@example.test`, role]);
  return `bayana_session=${await transaction(db => startSession(db, id))}`;
}
const slugFor = (tag: string) => `${tag}-${randomUUID().slice(0, 8)}`;
const service = { name: "Portrait session", price_paise: 800_000, duration_minutes: 60, advance_type: "PERCENT", advance_value: 25 };
/** A vendor with a profile, a service, a weekly rule, an override and a blocked period: something to steal on every route. */
async function vendorWithData(tag: string) {
  const cookie = await account(); const slug = slugFor(tag);
  expect((await call(cookie, "POST", "/v1/vendor/me", { business_name: `Studio ${tag}`, slug, city: "Mumbai", description: "Portraits" })).status).toBe(201);
  const created = await call(cookie, "POST", "/v1/vendor/services", service); expect(created.status).toBe(201);
  const rule = await call(cookie, "POST", "/v1/vendor/availability/rules", { weekday: 1, start_time: "09:00", end_time: "12:00" }); expect(rule.status).toBe(201);
  const override = await call(cookie, "POST", "/v1/vendor/availability/overrides", { local_date: "2027-01-04", kind: "block" }); expect(override.status).toBe(201);
  const start = new Date(Date.now() + 40 * 86_400_000);
  const block = await call(cookie, "POST", "/v1/vendor/availability/blocked-periods", { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(), reason: "Travel" }); expect(block.status).toBe(201);
  return { cookie, slug, serviceId: created.body.id as string, ruleId: rule.body.id as string, overrideId: override.body.id as string, blockId: block.body.id as string };
}

describe("ownership: vendor A can never read or change vendor B's data", () => {
  // Every route on the vendor router must appear here; the last test fails if a new route is added without an ownership case.
  const covered = new Set<string>();
  const check = (method: string, path: string) => covered.add(`${method} ${path}`);
  let a: Awaited<ReturnType<typeof vendorWithData>>, b: Awaited<ReturnType<typeof vendorWithData>>;
  beforeAll(async () => { a = await vendorWithData("a"); b = await vendorWithData("b"); });

  it("read routes return only the caller's own records", async () => {
    for (const path of ["/me", "/services", "/availability", "/checklist"]) {
      check("GET", path);
      const reply = await call(a.cookie, "GET", `/v1/vendor${path}`);
      expect(reply.status).toBe(200);
      for (const foreign of [b.slug, b.serviceId, b.ruleId, b.overrideId, b.blockId]) expect(reply.text).not.toContain(foreign);
    }
  });
  it("id routes treat another vendor's ids as not found and leave them untouched", async () => {
    const attempts: [string, string, unknown?][] = [
      ["PATCH", `/services/${b.serviceId}`, { name: "Hijacked" }], ["DELETE", `/services/${b.serviceId}`],
      ["DELETE", `/availability/rules/${b.ruleId}`], ["DELETE", `/availability/overrides/${b.overrideId}`], ["DELETE", `/availability/blocked-periods/${b.blockId}`]
    ];
    for (const [method, path, body] of attempts) {
      check(method, path.replace(/[0-9a-f-]{36}/, ":id"));
      const reply = await call(a.cookie, method, `/v1/vendor${path}`, body);
      expect(reply.status, `${method} ${path}`).toBe(404);
    }
    check("POST", "/services/reorder");
    expect((await call(a.cookie, "POST", "/v1/vendor/services/reorder", { ids: [a.serviceId, b.serviceId] })).status).toBe(404);
    const still = (await call(b.cookie, "GET", "/v1/vendor/availability")).body;
    expect(still.rules.map((rule: { id: string }) => rule.id)).toContain(b.ruleId);
    expect(still.overrides.map((item: { id: string }) => item.id)).toContain(b.overrideId);
    expect(still.blocked_periods.map((item: { id: string }) => item.id)).toContain(b.blockId);
    expect((await call(b.cookie, "GET", "/v1/vendor/services")).body.services[0]).toMatchObject({ id: b.serviceId, name: "Portrait session" });
  });
  it("write routes without ids only ever touch the caller's vendor", async () => {
    const writes: [string, string, unknown][] = [
      ["PATCH", "/me", { city: "Pune" }], ["PATCH", "/me/booking-window", { min_notice_minutes: 0 }], ["POST", "/services", { ...service, name: "A only" }],
      ["PUT", "/availability/rules", { windows: [{ weekday: 2, start_time: "10:00", end_time: "11:00" }] }], ["POST", "/availability/rules", { weekday: 3, start_time: "10:00", end_time: "11:00" }],
      ["POST", "/availability/overrides", { local_date: "2027-02-01", kind: "block" }], ["POST", "/availability/blocked-periods", { starts_at: new Date(Date.now() + 50 * 86_400_000).toISOString(), ends_at: new Date(Date.now() + 50 * 86_400_000 + 3_600_000).toISOString() }],
      ["POST", "/publish", {}], ["POST", "/unpublish", {}]
    ];
    const before = (await call(b.cookie, "GET", "/v1/vendor/availability")).text + (await call(b.cookie, "GET", "/v1/vendor/me")).text;
    for (const [method, path, body] of writes) { check(method, path); expect((await call(a.cookie, method, `/v1/vendor${path}`, body)).status, `${method} ${path}`).toBeLessThan(500); }
    const after = (await call(b.cookie, "GET", "/v1/vendor/availability")).text + (await call(b.cookie, "GET", "/v1/vendor/me")).text;
    expect(after).toBe(before);
  });
  it("cannot take another vendor's address, current or previous", async () => {
    check("POST", "/me");
    expect((await call(a.cookie, "PATCH", "/v1/vendor/me", { slug: b.slug })).body).toMatchObject({ error: { code: "SLUG_TAKEN" } });
    const old = b.slug; const renamed = slugFor("b2");
    expect((await call(b.cookie, "PATCH", "/v1/vendor/me", { slug: renamed })).status).toBe(200);
    expect((await call(a.cookie, "PATCH", "/v1/vendor/me", { slug: old })).body).toMatchObject({ error: { code: "SLUG_TAKEN" } });
    const fresh = await account();
    expect((await call(fresh, "POST", "/v1/vendor/me", { business_name: "Copycat", slug: old, city: "Delhi" })).body).toMatchObject({ error: { code: "SLUG_TAKEN" } });
    b.slug = renamed;
  });
  it("refuses signed-out callers and customer accounts on every route", async () => {
    const client = await account("CLIENT");
    for (const layer of vendorRouter.stack) {
      const route = layer.route as { path: string; methods: Record<string, boolean> } | undefined; if (!route) continue;
      const method = Object.keys(route.methods)[0].toUpperCase(); const path = route.path.replace(":id", randomUUID());
      for (const cookie of [null, client]) expect((await call(cookie, method, `/v1/vendor${path}`, method === "GET" ? undefined : {})).status, `${method} ${route.path}`).toBe(401);
    }
  });
  it("covers every vendor route", () => {
    const routes = vendorRouter.stack.flatMap(layer => { const route = layer.route as { path: string; methods: Record<string, boolean> } | undefined; return route ? [`${Object.keys(route.methods)[0].toUpperCase()} ${route.path}`] : []; });
    expect(routes.filter(route => !covered.has(route))).toEqual([]);
  });
});

describe("public pages: unpublished and unknown slugs return the identical 404 (VN-03)", () => {
  it("is byte-identical on the profile, month and slot endpoints", async () => {
    const vendor = await vendorWithData("hidden");
    const unknown = slugFor("nobody");
    for (const suffix of ["", `/availability/month?service_id=${vendor.serviceId}&month=2027-01`, `/availability/slots?service_id=${vendor.serviceId}&date=2027-01-05`]) {
      const hidden = await call(null, "GET", `/v1/vendors/${vendor.slug}${suffix}`); const missing = await call(null, "GET", `/v1/vendors/${unknown}${suffix}`);
      expect(hidden.status).toBe(404); expect(hidden.text).toBe(missing.text);
    }
  });
  it("a published vendor with someone else's service id gives the same 404", async () => {
    const a = await vendorWithData("pub"); const b = await vendorWithData("other");
    await call(a.cookie, "PATCH", "/v1/vendor/me", { terms: "Terms", cancellation_policy: "Cancel", rescheduling_policy: "Move" });
    expect((await call(a.cookie, "POST", "/v1/vendor/publish")).status).toBe(200);
    const foreign = await call(null, "GET", `/v1/vendors/${a.slug}/availability/slots?service_id=${b.serviceId}&date=2027-01-05`);
    const unknown = await call(null, "GET", `/v1/vendors/${slugFor("ghost")}/availability/slots?service_id=${b.serviceId}&date=2027-01-05`);
    expect(foreign.status).toBe(404); expect(foreign.text).toBe(unknown.text);
  });
  it("keeps owner contact details private unless the vendor opts in (VN-05)", async () => {
    const v = await vendorWithData("contact");
    await pool.query("UPDATE vendors SET contact_email='owner@example.test', contact_phone='+919999999999' WHERE slug=$1", [v.slug]);
    await call(v.cookie, "PATCH", "/v1/vendor/me", { terms: "Terms", cancellation_policy: "Cancel", rescheduling_policy: "Move" });
    await call(v.cookie, "POST", "/v1/vendor/publish");
    const hidden = await call(null, "GET", `/v1/vendors/${v.slug}`);
    expect(hidden.text).not.toContain("owner@example.test"); expect(hidden.text).not.toContain("+919999999999");
    await call(v.cookie, "PATCH", "/v1/vendor/me", { public_contact_email: true });
    expect((await call(null, "GET", `/v1/vendors/${v.slug}`)).body.contact_email).toBe("owner@example.test");
  });
});

describe("publish checklist and onboarding", () => {
  it("a brand-new vendor sees three steps and cannot publish until each requirement is met", async () => {
    const cookie = await account(); const slug = slugFor("new");
    await call(cookie, "POST", "/v1/vendor/me", { business_name: "New Studio", slug, city: "Goa", description: "Yoga" });
    const fresh = await call(cookie, "GET", "/v1/vendor/checklist");
    expect(fresh.body.steps.map((step: { key: string; done: boolean }) => [step.key, step.done])).toEqual([["service", false], ["availability", false], ["publish", false]]);
    expect(fresh.body.missing).toEqual(["active_service", "policies", "availability"]);
    expect((await call(cookie, "POST", "/v1/vendor/publish")).body).toMatchObject({ error: { code: "PUBLISH_CHECKLIST_INCOMPLETE", details: { missing: ["active_service", "policies", "availability"] } } });
    await call(cookie, "POST", "/v1/vendor/services", service);
    await call(cookie, "PUT", "/v1/vendor/availability/rules", { windows: [{ weekday: 1, start_time: "09:00", end_time: "17:00" }] });
    await call(cookie, "PATCH", "/v1/vendor/me", { terms: "Terms", cancellation_policy: "Cancel", rescheduling_policy: "Move" });
    expect((await call(cookie, "POST", "/v1/vendor/publish")).status).toBe(200);
    expect((await call(cookie, "GET", "/v1/vendor/checklist")).body.steps.every((step: { done: boolean }) => step.done)).toBe(true);
    expect((await call(null, "GET", `/v1/vendors/${slug}`)).status).toBe(200);
    expect((await call(cookie, "POST", "/v1/vendor/unpublish")).status).toBe(204);
    expect((await call(null, "GET", `/v1/vendors/${slug}`)).status).toBe(404);
  });
  it("counts a future open override as availability", async () => {
    const cookie = await account(); await call(cookie, "POST", "/v1/vendor/me", { business_name: "Pop-up", slug: slugFor("popup"), city: "Pune" });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await call(cookie, "POST", "/v1/vendor/availability/overrides", { local_date: tomorrow, kind: "open", start_time: "10:00", end_time: "12:00" });
    expect((await call(cookie, "GET", "/v1/vendor/checklist")).body.steps[1]).toMatchObject({ key: "availability", done: true });
  });
});

describe("services, availability and the public slot engine", () => {
  it("rejects bad service input with field messages and computes the advance server-side", async () => {
    const cookie = await account(); await call(cookie, "POST", "/v1/vendor/me", { business_name: "Rules", slug: slugFor("rules"), city: "Pune" });
    const tooBig = await call(cookie, "POST", "/v1/vendor/services", { ...service, advance_type: "FIXED", advance_value: 900_000 });
    expect(tooBig.status).toBe(400); expect(JSON.stringify(tooBig.body)).toContain("A fixed advance cannot be more than the price.");
    const tiers = await call(cookie, "POST", "/v1/vendor/services", { ...service, cancellation_tiers: [{ min_hours_before: 24, refund_percent: 50 }, { min_hours_before: 72, refund_percent: 100 }] });
    expect(tiers.status).toBe(400);
    const terms = await call(cookie, "POST", "/v1/vendor/services", { ...service, terms_template: "Pay {{prise}}" });
    expect(JSON.stringify(terms.body)).toContain("Unknown variable {{prise}}");
    const ok = await call(cookie, "POST", "/v1/vendor/services", { ...service, cancellation_tiers: [{ min_hours_before: 72, refund_percent: 100 }, { min_hours_before: 24, refund_percent: 50 }], terms_template: "Advance {{advance}}" });
    expect(ok.status).toBe(201); expect(ok.body.cancellation_tiers).toHaveLength(2);
    const patched = await call(cookie, "PATCH", `/v1/vendor/services/${ok.body.id}`, { price_paise: 100_000, advance_type: "FIXED", advance_value: 200_000 });
    expect(patched.status).toBe(400);
  });
  it("rejects overlapping weekly windows on PUT and POST", async () => {
    const cookie = await account(); await call(cookie, "POST", "/v1/vendor/me", { business_name: "Hours", slug: slugFor("hours"), city: "Pune" });
    expect((await call(cookie, "PUT", "/v1/vendor/availability/rules", { windows: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }, { weekday: 1, start_time: "11:00", end_time: "13:00" }] })).status).toBe(400);
    await call(cookie, "PUT", "/v1/vendor/availability/rules", { windows: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }] });
    expect((await call(cookie, "POST", "/v1/vendor/availability/rules", { weekday: 1, start_time: "11:30", end_time: "13:00" })).body).toMatchObject({ error: { code: "WINDOW_OVERLAP" } });
  });
  it("public slots honour weekly hours, overrides, notice and the booking window", async () => {
    const v = await vendorWithData("slots");
    await call(v.cookie, "PATCH", "/v1/vendor/me", { terms: "Terms", cancellation_policy: "Cancel", rescheduling_policy: "Move", timezone: "Asia/Kolkata" });
    await call(v.cookie, "PATCH", "/v1/vendor/me/booking-window", { min_notice_minutes: 0, max_advance_days: 365 });
    await call(v.cookie, "PUT", "/v1/vendor/availability/rules", { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start_time: "09:00", end_time: "12:00" })) });
    await call(v.cookie, "POST", "/v1/vendor/publish");
    const day = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const slots = async () => (await call(null, "GET", `/v1/vendors/${v.slug}/availability/slots?service_id=${v.serviceId}&date=${day}`)).body.slots as { startsAt: string }[];
    expect((await slots()).length).toBe(5); // 09:00..11:00 every 30 min for a 60 min service
    const block = await call(v.cookie, "POST", "/v1/vendor/availability/overrides", { local_date: day, kind: "block" });
    expect(await slots()).toEqual([]);
    await call(v.cookie, "POST", "/v1/vendor/availability/overrides", { local_date: day, kind: "open", start_time: "18:00", end_time: "19:00" });
    expect((await slots()).length).toBe(1);
    await call(v.cookie, "DELETE", `/v1/vendor/availability/overrides/${block.body.id}`);
    await call(v.cookie, "PATCH", "/v1/vendor/me/booking-window", { max_advance_days: 10 });
    expect(await slots()).toEqual([]);
  });
});
