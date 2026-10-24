import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

const api = () => process.env.E2E_API_URL ?? "http://127.0.0.1:4100";
const mailpit = () => process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025";

/** The newest Bayana code sent to an address, read from Mailpit's API (subject "Your Bayana code: 123456"). */
export async function codeFor(email: string, after = 0): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Your Bayana code"`)}`);
    if (response.ok) {
      const { messages = [] } = await response.json() as { messages?: { Subject: string; Created: string }[] };
      const fresh = messages.filter(message => new Date(message.Created).getTime() >= after).sort((a, b) => b.Created.localeCompare(a.Created))[0];
      const code = fresh?.Subject.match(/(\d{6})$/)?.[1];
      if (code) return code;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`No code reached Mailpit for ${email}. Is Mailpit running (pnpm.cmd db:up)?`);
}

async function call(path: string, body: unknown, cookie?: string, method = "POST") {
  const response = await fetch(`${api()}${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
  return response;
}

/** A published vendor created the way a real one is: email code signup, profile, service, hours, policies, publish. */
export async function publishedVendor(name = "Studio Live") {
  const tag = randomUUID().slice(0, 8), email = `e2e-vendor-${tag}@example.test`, slug = `e2e-${tag}`;
  const asked = Date.now() - 1000;
  await call("/v1/auth/otp/request", { email, purpose: "signup" });
  const signup = await call("/v1/auth/signup", { email, code: await codeFor(email, asked), password: "violet-harbour-lantern-42" });
  const cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  await call("/v1/vendor/me", { business_name: `${name} ${tag}`, slug, city: "Mumbai", description: "Portraits and small events across Mumbai.", categories: ["photography"], timezone: "Asia/Kolkata" }, cookie);
  const service = await (await call("/v1/vendor/services", { name: "Portrait session", description: "60 minutes, one location.", price_paise: 800_000, duration_minutes: 60, advance_type: "PERCENT", advance_value: 25, cancellation_tiers: [{ min_hours_before: 48, refund_percent: 50 }], terms_template: "{{customer_name}} pays {{advance}} now and {{balance}} on {{date}}." }, cookie)).json() as { id: string };
  await call("/v1/vendor/availability/rules", { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start_time: "09:00", end_time: "18:00" })) }, cookie, "PUT");
  await call("/v1/vendor/me", { terms: "The advance confirms your date.", cancellation_policy: "Half the advance back until 48 hours before.", rescheduling_policy: "One free reschedule with 48 hours' notice.", phone_required: true }, cookie, "PATCH");
  await call("/v1/vendor/publish", {}, cookie);
  return { slug, serviceId: service.id, displayName: `${name} ${tag}` };
}

/** Walks the stepper from the time step up to the code step, picking the first open time. */
export async function chooseTimeAndDetails(page: Page, customer: { name: string; email: string }) {
  await expect(page.getByText("Step 2 of 6: Time")).toBeVisible();
  const firstTime = page.getByRole("list", { name: "Open times" }).getByRole("button").first();
  await firstTime.click();
  const chosen = await firstTime.textContent();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill(customer.name);
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Phone").fill("+91 98000 00000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  return chosen;
}
