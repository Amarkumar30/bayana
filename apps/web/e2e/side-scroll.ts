import type { Page, TestType } from "@playwright/test";

// Booking pages must never scroll sideways at 375 px (or any width). Checking once per test missed a single bad step (the pay
// step), so this watches every screen a test passes through: an init script measures the page after each DOM change and
// reports any overflow to the test, which fails in afterEach naming the page and heading where it happened.
type Overflow = { pixels: number; where: string };
const overflowFor = new WeakMap<Page, Overflow>();

const watcher = `(() => {
  let reported = 0;
  const check = () => {
    const root = document.documentElement; if (!root) return;
    const over = root.scrollWidth - window.innerWidth;
    if (over > reported) { reported = over; const heading = document.querySelector("main h2, main h1, h2, h1"); window.__bayanaSideScroll?.(over, location.pathname + " | " + (heading ? heading.textContent.trim() : "")); }
  };
  let queued = false;
  const soon = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; check(); }); };
  const start = () => { new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true }); window.addEventListener("resize", soon); check(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();`;

/** Every test in the calling file fails if any screen it visits is wider than the viewport. */
export function guardSideScroll(test: TestType<{ page: Page }, object>) {
  test.beforeEach(async ({ page }) => {
    overflowFor.set(page, { pixels: 0, where: "" });
    await page.exposeBinding("__bayanaSideScroll", (_source, pixels: number, where: string) => { const worst = overflowFor.get(page); if (worst && pixels > worst.pixels) overflowFor.set(page, { pixels, where }); });
    await page.addInitScript(watcher);
  });
  test.afterEach(async ({ page }) => {
    if (!page.isClosed()) { const now = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0); const worst = overflowFor.get(page); if (worst && now > worst.pixels) overflowFor.set(page, { pixels: now, where: `${new URL(page.url()).pathname} (at the end)` }); }
    const worst = overflowFor.get(page) ?? { pixels: 0, where: "" };
    if (worst.pixels > 0) throw new Error(`The page scrolled sideways by ${worst.pixels}px at ${worst.where}. Booking pages must fit the screen width.`);
  });
}
