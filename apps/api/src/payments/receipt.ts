import type { Pool, PoolClient } from "pg";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dayRangeLabel, localDateOf } from "@bayana/shared";
import { bookingReference } from "./service.js";

// Payment receipts (PY-11): one PDF per verified payment. Totals come from the ledger, so the PDF always equals it.

export type ReceiptData = {
  receiptNumber: string; issuedAt: Date;
  vendor: { name: string; city: string; gstin: string | null };
  customer: { name: string; email: string };
  /** days: daily bookings only (shown as dates, never a time). */
  booking: { reference: string; service: string; startsAt: Date; timezone: string; days?: number | null };
  payment: { amountPaise: number; kind: string; channel: string; method: string | null; providerPaymentId: string | null; paidAt: Date };
  totals: { totalPaise: number; paidToDatePaise: number; refundedPaise: number; balancePaise: number };
};

export async function receiptData(db: Pool | PoolClient, bookingId: string, paymentId: string): Promise<ReceiptData | null> {
  const found = await db.query<{ amount_paise: string; kind: string; provider: string; method: string | null; provider_payment_id: string | null; verified_at: Date; total_paise: string; client_name: string; client_email: string; service_name: string | null; starts_at: Date; booking_mode: string; days_count: number | null; vendor_timezone: string; display_name: string; city: string; gstin: string | null; timezone: string; paid: string; refunded: string }>(
    `SELECT p.amount_paise,p.kind,p.provider,p.method,p.provider_payment_id,p.verified_at,b.total_paise,b.client_name,b.client_email::text AS client_email,b.service_name,b.starts_at,b.booking_mode,b.days_count,b.vendor_timezone,v.display_name,v.city,v.gstin,v.timezone,
       COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind='PAYMENT'),0) AS paid,
       COALESCE((SELECT SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind='REFUND'),0) AS refunded
     FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN vendors v ON v.id=b.vendor_id WHERE p.id=$1 AND p.booking_id=$2 AND p.verified_at IS NOT NULL`, [paymentId, bookingId]);
  if (!found.rowCount) return null;
  const row = found.rows[0];
  const paidToDate = Number(row.paid) - Number(row.refunded);
  return {
    receiptNumber: `${bookingReference(bookingId).slice(3, 11).toUpperCase()}-${paymentId.slice(0, 8).toUpperCase()}`, issuedAt: new Date(),
    vendor: { name: row.display_name, city: row.city, gstin: row.gstin },
    customer: { name: row.client_name, email: row.client_email },
    booking: { reference: bookingReference(bookingId), service: row.service_name ?? "Booking", startsAt: row.starts_at, timezone: row.booking_mode === "daily" ? row.vendor_timezone : row.timezone, days: row.booking_mode === "daily" ? row.days_count : null },
    payment: { amountPaise: Number(row.amount_paise), kind: row.kind, channel: row.provider, method: row.method, providerPaymentId: row.provider_payment_id, paidAt: row.verified_at },
    totals: { totalPaise: Number(row.total_paise), paidToDatePaise: paidToDate, refundedPaise: Number(row.refunded), balancePaise: Number(row.total_paise) - paidToDate }
  };
}

// The standard PDF fonts only cover Latin-1, so amounts read "INR 1,234.00" and other characters become "?".
const inr = (paise: number) => `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100)}`;
const latin1 = (text: string) => [...text].map(char => char.charCodeAt(0) <= 0xff ? char : "?").join("");
const when = (date: Date, timezone: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(date);

export async function receiptPdf(data: ReceiptData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${data.receiptNumber}`); pdf.setAuthor("Bayana"); pdf.setCreator("Bayana"); pdf.setProducer("Bayana");
  // Machine-readable totals, so a test (or an accountant's tool) can check the PDF against the ledger.
  pdf.setKeywords([`amount=${data.payment.amountPaise}`, `total=${data.totals.totalPaise}`, `paid=${data.totals.paidToDatePaise}`, `refunded=${data.totals.refundedPaise}`, `balance=${data.totals.balancePaise}`]);
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const line = (text: string, options: { size?: number; strong?: boolean; gap?: number } = {}) => { page.drawText(latin1(text), { x: 56, y, size: options.size ?? 11, font: options.strong ? bold : regular, color: rgb(0.1, 0.12, 0.16) }); y -= options.gap ?? 18; };
  const row = (label: string, value: string, strong = false) => { page.drawText(latin1(label), { x: 56, y, size: 11, font: regular, color: rgb(0.35, 0.38, 0.42) }); page.drawText(latin1(value), { x: 300, y, size: 11, font: strong ? bold : regular }); y -= 18; };
  line("Payment receipt", { size: 20, strong: true, gap: 26 });
  line(`Receipt ${data.receiptNumber} · issued ${when(data.issuedAt, data.booking.timezone)}`, { size: 10, gap: 28 });
  line(data.vendor.name, { strong: true }); line(data.vendor.city, { gap: data.vendor.gstin ? 18 : 28 });
  if (data.vendor.gstin) line(`GSTIN ${data.vendor.gstin}`, { gap: 28 });
  row("Received from", `${data.customer.name} <${data.customer.email}>`);
  row("Booking", `${data.booking.service}, ${data.booking.days ? dayRangeLabel(localDateOf(data.booking.startsAt, data.booking.timezone), data.booking.days) : when(data.booking.startsAt, data.booking.timezone)}`);
  row("Booking reference", data.booking.reference);
  y -= 10;
  row(`Amount received (${data.payment.kind})`, inr(data.payment.amountPaise), true);
  row("Paid on", when(data.payment.paidAt, data.booking.timezone));
  row("Paid via", data.payment.channel === "offline" ? `Paid to the business directly (${data.payment.method ?? "other"})` : `Razorpay (${data.payment.method ?? "online"})`);
  if (data.payment.providerPaymentId) row("Payment id", data.payment.providerPaymentId);
  y -= 10;
  row("Booking total", inr(data.totals.totalPaise));
  row("Paid to date", inr(data.totals.paidToDatePaise));
  if (data.totals.refundedPaise) row("Refunded", inr(data.totals.refundedPaise));
  row("Balance due", inr(data.totals.balancePaise), true);
  y -= 20;
  line("Bayana records this payment for the business named above. Questions about the service go to the business.", { size: 9 });
  return pdf.save();
}
