import type { FullConfig } from "@playwright/test";
import { routes } from "./routes";

/**
 * `next dev` compiles each route on first request and hot-swaps the shared Tailwind stylesheet when it does.
 * Compiling every route once, sequentially, before tests start keeps parallel tests from screenshotting mid-swap.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  if (!baseURL) throw new Error("baseURL is required for the route warm-up");
  for (const route of routes) {
    const response = await fetch(new URL(route, baseURL));
    if (response.status >= 500) throw new Error(`Warm-up failed for ${route}: ${response.status}`);
  }
}
