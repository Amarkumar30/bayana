import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";
import { routes } from "./routes";
const states = ["/dashboard/bookings?state=empty", "/dashboard/bookings?state=loading", "/dashboard/calendar?state=empty", "/dashboard/payments?state=empty", "/b/x?state=loading"];

for (const route of [...routes, ...states]) {
  test(`${route} fits the viewport and labels every control`, async ({ page }) => {
    await mockApi(page);
    const response = await page.goto(route);
    expect(response?.status(), "page should render").toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
    // aria-hidden inputs are Radix's internal form mirrors; they are invisible to assistive tech and never focusable.
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([aria-hidden=true]), select, textarea, button, [role=switch]")]
      .filter(element => element.offsetParent !== null || element.getClientRects().length > 0)
      .filter(element => { const label = (element as HTMLInputElement).labels?.[0]?.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.textContent?.trim() || element.getAttribute("title"); return !label; })
      .map(element => element.outerHTML.slice(0, 120)));
    expect(unlabelled, "every control has an accessible name").toEqual([]);
  });
}

for (const route of ["/design", "/", "/auth", "/dashboard", "/dashboard/bookings", "/b/x"]) {
  test(`${route} renders without console errors or hydration mismatches`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text().slice(0, 300)); });
    page.on("pageerror", error => errors.push(error.message.slice(0, 300)));
    await mockApi(page);
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // The mocked 401s are expected network responses, not page errors.
    expect(errors.filter(text => !text.includes("401 (Unauthorized)"))).toEqual([]);
  });
}

test("primary actions meet the 44px touch target on phones", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-375", "touch targets are a phone concern");
  for (const route of ["/", "/auth", "/dashboard/bookings", "/design"]) {
    await mockApi(page); await page.goto(route);
    // A switch's target is its whole labelled row (the <label for> toggles it), so measure that row instead of the 28px track.
    const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button, main a[class*='min-h'], main input:not([type=checkbox]):not([type=hidden]), main select")]
      .filter(element => element.getClientRects().length > 0)
      .map(element => element.getAttribute("role") === "switch" ? (element.parentElement ?? element) : element)
      .map(element => ({ html: element.outerHTML.slice(0, 80), height: element.getBoundingClientRect().height }))
      .filter(entry => entry.height < 43.5));
    expect(small, `${route}: controls under 44px`).toEqual([]);
  }
});

test("skip link is the first stop and moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
  await page.goto("/design");
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 5; index++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("date picker moves with arrow keys and skips unavailable dates", async ({ page }) => {
  await page.goto("/design");
  const day = (n: number) => page.locator(`[data-date="2026-11-${String(n).padStart(2, "0")}"]`);
  await day(14).focus();
  await page.keyboard.press("ArrowRight"); await expect(day(16)).toBeFocused();
  await page.keyboard.press("ArrowDown"); await expect(day(23)).toBeFocused();
  await page.keyboard.press("Enter"); await expect(day(23)).toHaveAttribute("aria-pressed", "true");
});

test("a switch toggles from its label and from the keyboard", async ({ page }) => {
  await page.goto("/design");
  const control = page.getByRole("switch", { name: "Show my phone number publicly" });
  await page.getByText("Show my phone number publicly", { exact: true }).click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.focus(); await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("tabs switch with arrow keys", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("tab", { name: "Upcoming" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Past" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Past bookings panel.")).toBeVisible();
});
