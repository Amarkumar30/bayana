import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MOCK_NOW, SAMPLE_BOOKING_ID, mockApi } from "./mock-api";

// WCAG 2.1 AA checks with axe on the key screens (mocked API). Serious and critical findings fail the test; the server-rendered
// public vendor page needs the real API and is checked in e2e-live/a11y.spec.ts.
const pages = ["/", "/login", "/signup", "/privacy", "/terms", "/refunds", "/vendor-terms", "/contact", "/pricing", "/studio-sunday/book", `/b/${SAMPLE_BOOKING_ID}?t=sample-token`, "/my-bookings", "/dashboard", "/dashboard/calendar", "/dashboard/bookings", "/dashboard/bookings/7f3c2a10-0002-4000-8000-000000000002", "/dashboard/settings", "/dashboard/payments", "/admin", "/admin/bookings/7f3c2a10-0002-4000-8000-000000000002"];

for (const path of pages) {
  test(`${path} has no serious or critical accessibility problems`, async ({ page }) => {
    await page.clock.setFixedTime(MOCK_NOW);
    await mockApi(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter(violation => violation.impact === "serious" || violation.impact === "critical")
      .map(violation => `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.slice(0, 3).map(node => node.target.join(" ")).join(" | ")}`);
    expect(blocking).toEqual([]);
  });
}
