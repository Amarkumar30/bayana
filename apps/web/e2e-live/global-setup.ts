import type { FullConfig } from "@playwright/test";

// `next dev` compiles each route on its first request, which can take longer than an assertion waits. Compile the
// routes the live suite visits once, before any test starts (same approach as e2e/global-setup.ts).
const routes = ["/waking", "/e2e-warm-up", "/e2e-warm-up/book", "/b/00000000-0000-4000-8000-000000000000", "/login", "/dashboard/bookings", "/dashboard/bookings/00000000-0000-4000-8000-000000000000"];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  if (!baseURL) throw new Error("baseURL is required for the route warm-up");
  for (const route of routes) {
    const response = await fetch(new URL(route, baseURL), { signal: AbortSignal.timeout(120_000) });
    if (response.status >= 500 && route !== "/e2e-warm-up") throw new Error(`Warm-up failed for ${route}: ${response.status}`);
  }
}
