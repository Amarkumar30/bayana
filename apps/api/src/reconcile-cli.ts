import { pool } from "./database.js";
import { log } from "./logger.js";
import { reconcile } from "./payments/reconcile.js";
import { paymentProvider } from "./payments/runtime.js";

// pnpm.cmd payments:reconcile [hours]  -- report-only comparison of Razorpay and the local ledger (default: last 48 hours).
const hours = Number(process.argv[2] ?? 48);
if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) { process.stderr.write("Usage: pnpm.cmd payments:reconcile [hours 1..720]\n"); process.exit(2); }
try {
  const report = await reconcile(pool, paymentProvider(), { hours });
  process.stdout.write(`Reconcile ${report.from.toISOString()} .. ${report.to.toISOString()}: ${report.checked.payments} Razorpay payments, ${report.checked.refunds} refunds checked.\n`);
  if (!report.differences.length) process.stdout.write("No differences.\n");
  for (const item of report.differences) process.stdout.write(`- ${item.kind}: ${item.detail}${item.booking_id ? ` (booking ${item.booking_id})` : ""}${item.provider_id ? ` [${item.provider_id}]` : ""}${item.local_paise !== null || item.provider_paise !== null ? ` local=${item.local_paise ?? "-"} razorpay=${item.provider_paise ?? "-"}` : ""}\n`);
  log("info", "reconcile.completed", { hours, differences: report.differences.length });
  process.exitCode = report.differences.length ? 1 : 0;
} catch (error) {
  process.stderr.write(`Reconcile failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
} finally { await pool.end(); }
