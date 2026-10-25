import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { publishedVendor } from "./helpers";

// The public vendor page is rendered by the server from the real API, so its axe check runs in the live suite.
test.skip(process.env.E2E_PAYMENTS === "fake", "runs in the payments-disabled pass");

test("the public vendor page has no serious or critical accessibility problems", async ({ page }) => {
  const vendor = await publishedVendor("Axe Studio");
  await page.goto(`/${vendor.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: vendor.displayName })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter(violation => violation.impact === "serious" || violation.impact === "critical").map(violation => `${violation.id}: ${violation.help} — ${violation.nodes.slice(0, 3).map(node => node.target.join(" ")).join(" | ")}`);
  expect(blocking).toEqual([]);
});
