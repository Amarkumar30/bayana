import { expect, test } from "@playwright/test";
import { footerLinks } from "../components/layout/site-footer";
import { businessDetails, filledDetail } from "../lib/business-details";
import { mockApi } from "./mock-api";

// The legal and company pages a payment partner and a lawyer will read. Each renders, names the operator, and is reachable
// from the footer on every kind of public page.
const legalPages = ["/terms", "/vendor-terms", "/privacy", "/refunds", "/shipping", "/contact", "/about", "/pricing"];

for (const path of legalPages) {
  test(`${path} returns 200 and names the business`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main")).toContainText(businessDetails.legalName);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("site-footer")).toHaveCount(1);
  });
}

test("the lawyer-review banner shows while LEGAL_REVIEWED is not true", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByText("Draft: needs lawyer review.")).toBeVisible();
});

// One page from each public layout: marketing (site), a vendor's booking flow (public) and sign-in (auth).
for (const path of ["/terms", "/studio-sunday/book", "/login"]) {
  test(`${path} has the full footer, never prints a placeholder, and every footer link resolves`, async ({ page }) => {
    await mockApi(page);
    await page.goto(path);
    const footer = page.getByTestId("site-footer");
    // Filled details are shown; unfilled ones are left out, never printed as [PLACEHOLDERS].
    for (const value of [businessDetails.legalName, businessDetails.address, businessDetails.grievanceOfficer.name]) {
      if (filledDetail(value)) await expect(footer).toContainText(value); else await expect(footer).not.toContainText(value);
    }
    await expect(footer).not.toContainText(/\[[A-Z][A-Z0-9 ,.:%&/()-]*\]/);
    await expect(footer).toContainText(businessDetails.supportEmail);
    await expect(footer).toContainText(businessDetails.grievanceOfficer.email);
    const hrefs = await footer.locator("nav a").evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(hrefs).toEqual([...footerLinks.product, ...footerLinks.legal].map(link => link.href));
    for (const href of hrefs) expect((await page.request.get(href!)).status(), href!).toBe(200);
  });
}

test("outside production, robots.txt keeps every crawler out; the sitemap lists the legal pages", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-Agent: \*\s+Disallow: \//i);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of legalPages) expect(sitemap).toContain(`${path}</loc>`);
});
