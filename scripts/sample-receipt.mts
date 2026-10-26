// pnpm.cmd docs:sample-invoice — writes docs/sample-invoice.pdf with the real receipt generator (apps/api/src/payments/receipt.ts)
// and clearly fictitious sample data, for the Razorpay application and for review. Touches no database.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { receiptPdf } from "../apps/api/src/payments/receipt.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bytes = await receiptPdf({
  receiptNumber: "SAMPLE01-0000A1B2", issuedAt: new Date("2026-11-02T06:30:00Z"),
  vendor: { name: "Studio Sunday Photography (SAMPLE)", city: "Pune", gstin: "27AAAAA0000A1Z5" },
  customer: { name: "Ananya Iyer (sample customer)", email: "customer@example.com" },
  booking: { reference: "BK-SAMPLE01", service: "Portrait session, 2 hours", startsAt: new Date("2026-11-15T04:30:00Z"), timezone: "Asia/Kolkata" },
  payment: { amountPaise: 300000, kind: "advance", channel: "razorpay", method: "upi", providerPaymentId: "pay_SAMPLE0000000001", paidAt: new Date("2026-11-02T06:29:00Z") },
  totals: { totalPaise: 1200000, paidToDatePaise: 300000, refundedPaise: 0, balancePaise: 900000 }
});
const out = path.join(root, "docs", "sample-invoice.pdf");
await writeFile(out, bytes);
process.stdout.write(`Wrote ${path.relative(root, out)} (${bytes.length} bytes)\n`);
