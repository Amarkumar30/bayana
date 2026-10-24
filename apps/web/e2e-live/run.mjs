// pnpm.cmd test:e2e: the live suite twice, each time with a fresh API process.
//   disabled: PAYMENT_MODE=disabled (the honest offline-advance flow and the two-browser race)
//   fake:     PAYMENT_MODE=test with PAYMENT_PROVIDER=fake (Checkout is stubbed in the browser; no network, no real keys)
import { spawnSync } from "node:child_process";

for (const payments of ["disabled", "fake"]) {
  process.stdout.write(`\n=== live E2E with payments: ${payments} ===\n`);
  const result = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "playwright.live.config.ts", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env: { ...process.env, E2E_PAYMENTS: payments } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
