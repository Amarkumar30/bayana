import path from "node:path";
import { expect, test } from "@playwright/test";
import { MOCK_NOW, mockApi } from "./mock-api";

// Hides Next.js dev tooling from baselines; see screenshot.css.
const stylePath = path.join(__dirname, "screenshot.css");

// Screenshot baselines live in e2e/__screenshots__ and are platform-specific (fonts render differently per OS).
const pages = [
  { name: "design", path: "/design", ready: "Design system" },
  { name: "home", path: "/", ready: "Get booked." },
  { name: "login", path: "/login", ready: "Welcome back" },
  { name: "dashboard", path: "/dashboard", ready: "Studio Sunday" },
  { name: "booking-detail", path: "/dashboard/bookings/7f3c2a10-0002-4000-8000-000000000002", ready: "Rohit Malhotra" },
  { name: "calendar", path: "/dashboard/calendar", ready: "November 2026" },
  { name: "admin-booking", path: "/admin/bookings/7f3c2a10-0002-4000-8000-000000000002", ready: "Rohit Malhotra" }
];

for (const { name, path: route, ready } of pages) {
  test(`${name} matches its screenshot`, async ({ page }) => {
    // Dated content (today, next 7 days, the month) is rendered against a fixed clock.
    await page.clock.setFixedTime(MOCK_NOW);
    await mockApi(page);
    await page.goto(route);
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toContainText(ready);
    // Wait until the full stylesheet (including breakpoint variants) is applied, not just the first paint.
    if (name !== "login") await expect(heading).toHaveCSS("font-size", (page.viewportSize()?.width ?? 0) >= 640 ? (name === "home" ? "48px" : "32px") : (name === "home" ? "32px" : "24px"));
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, stylePath });
  });
}

test("design page in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/design");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Design system");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("design-dark.png", { fullPage: true, stylePath });
});
