import { dayRangeLabel, durationLabel, formatINR, localDateOf } from "@bayana/shared";

// Email templates (SPEC 15.2). Every email has a subject, a plain-text part and a small responsive HTML part:
// table layout and inline styles (what mail clients understand), no images or tracking pixels, and the brand mark drawn
// with HTML because Gmail and Outlook do not display SVG.

export type Rendered = { subject: string; text: string; html: string };
type Row = [label: string, value: string];
type Layout = { preheader: string; heading: string; paragraphs: string[]; rows?: Row[]; action?: { label: string; url: string }; note?: string };

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
export const when = (iso: Date | string, timezone: string) => `${new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso))} (${timezone})`;

/** A multi-session booking's full range: "Friday, 12 November 2026, 2:00 pm to 5:00 pm, 3 hours (Asia/Kolkata)". */
export const whenRange = (start: Date | string, end: Date | string, timezone: string) => {
  const from = new Date(start), to = new Date(end);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(from);
  const time = (instant: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
  return `${date}, ${time(from)} to ${time(to)}, ${durationLabel(Math.round((to.getTime() - from.getTime()) / 60_000))} (${timezone})`;
};

const INK = "#101418", SAFFRON = "#D97A00", MUTED = "#5b6472", LINE = "#e6e4dc", PAGE = "#fafaf7", PRIMARY = "#3730a3";
function html(layout: Layout) {
  const rows = (layout.rows ?? []).map(([label, value]) => `<tr><td style="padding:6px 0;color:${MUTED};font-size:14px;width:42%;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600;vertical-align:top">${escape(value)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(layout.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px">
<tr><td style="padding:24px 28px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:6px;height:28px;background:${INK};border-radius:2px"></td><td style="width:4px"></td><td style="width:16px;height:16px;background:${SAFFRON};border-radius:8px;vertical-align:bottom"></td>
<td style="padding-left:10px;font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${INK}">Bayana</td></tr></table></td></tr>
<tr><td style="padding:12px 28px 4px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:${INK}">${escape(layout.heading)}</h1></td></tr>
<tr><td style="padding:4px 28px">${layout.paragraphs.map(text => `<p style="margin:12px 0;font-size:15px;line-height:1.55;color:${INK}">${escape(text)}</p>`).join("")}</td></tr>
${rows ? `<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};padding:6px 0">${rows}</table></td></tr>` : ""}
${layout.action ? `<tr><td style="padding:16px 28px"><a href="${escape(layout.action.url)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escape(layout.action.label)}</a></td></tr>` : ""}
${layout.note ? `<tr><td style="padding:4px 28px 8px"><p style="margin:8px 0;font-size:13px;line-height:1.5;color:${MUTED}">${escape(layout.note)}</p></td></tr>` : ""}
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${LINE}"><p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">Sent by Bayana for the business named above. Bayana never asks for your card details by email.</p></td></tr>
</table></td></tr></table></body></html>`;
}
function text(layout: Layout) {
  return [layout.heading, "", ...layout.paragraphs.flatMap(paragraph => [paragraph, ""]), ...(layout.rows ?? []).map(([label, value]) => `${label}: ${value}`), ...(layout.rows?.length ? [""] : []),
    ...(layout.action ? [`${layout.action.label}: ${layout.action.url}`, ""] : []), ...(layout.note ? [layout.note, ""] : []), "Sent by Bayana for the business named above."].join("\n");
}
const render = (subject: string, layout: Layout): Rendered => ({ subject, text: text(layout), html: html(layout) });

// ---- Data each template needs ---------------------------------------------------------------------------------------
type BookingFacts = { businessName: string; customerName: string; service: string; startsAt: Date | string; timezone: string; /** Daily bookings: how many days (shown as a date range, never a time). */ days?: number | null; /** Hourly bookings of more than one session: the range is shown, not just the start. */ blocks?: number | null; endsAt?: Date | string | null; totalPaise: number; advancePaise: number; paidPaise: number; link: string };
export type TemplateData = {
  otp: { code: string; action: string; minutes: number };
  hold_started: BookingFacts & { holdUntil: Date | string; online: boolean };
  booking_request_vendor: BookingFacts & { customerEmail: string };
  booking_confirmed_customer: BookingFacts & { cancellation: string };
  booking_confirmed_vendor: BookingFacts & { customerEmail: string };
  booking_cancelled: BookingFacts & { audience: "customer" | "vendor"; cancelledBy: "customer" | "vendor"; reason: string; refundPaise: number; refundManual: boolean };
  refund_issued: { businessName: string; customerName: string; amountPaise: number; service: string; link: string };
  reminder_24h: BookingFacts & { audience: "customer" | "vendor"; place: string; customerEmail: string };
  payment_review: { problem: string; bookingId: string | null; lines: string[] };
  payment_recorded: BookingFacts & { amountPaise: number; kind: "advance" | "balance"; confirmed: boolean };
  booking_rescheduled: BookingFacts & { previousStartsAt: Date | string };
};
export type TemplateName = keyof TemplateData;

const money = (paise: number) => formatINR(paise);
/** A daily booking reads as its dates ("12 Nov to 13 Nov 2026 (2 days)"); an hourly one as its date and time. */
const whenOf = (data: { startsAt: Date | string; timezone: string; days?: number | null; blocks?: number | null; endsAt?: Date | string | null }) => data.days ? dayRangeLabel(localDateOf(new Date(data.startsAt), data.timezone), data.days)
  : data.blocks && data.blocks > 1 && data.endsAt ? whenRange(data.startsAt, data.endsAt, data.timezone) : when(data.startsAt, data.timezone);
const bookingRows = (data: BookingFacts): Row[] => [["Service", data.service], ["With", data.businessName], ["When", whenOf(data)], ["Total", money(data.totalPaise)], ["Paid so far", money(data.paidPaise)], ["Balance due", money(data.totalPaise - data.paidPaise)]];

export const templates: { [K in TemplateName]: (data: TemplateData[K]) => Rendered } = {
  // The code stays in the subject: people read it from the notification without opening the email.
  otp: data => render(`Your Bayana code: ${data.code}`, { preheader: `Use ${data.code} to ${data.action}.`, heading: `Your code is ${data.code}`, paragraphs: [`Use this code to ${data.action}. It expires in ${data.minutes} minutes.`], note: "If you did not ask for this code, you can ignore this email; nothing changes without it." }),
  hold_started: data => render(`Your time with ${data.businessName} is held`, {
    preheader: `${data.service}, ${whenOf(data)}`, heading: "Your time is held",
    paragraphs: [`Hi ${data.customerName}, we are holding ${data.service} with ${data.businessName} for you.`, data.online ? `Agree to the terms and pay the ${money(data.advancePaise)} advance by ${when(data.holdUntil, data.timezone)} to confirm it. After that the time is released.` : `Agree to the terms by ${when(data.holdUntil, data.timezone)}. ${data.businessName} will then arrange the ${money(data.advancePaise)} advance with you.`],
    rows: [["Service", data.service], ["When", whenOf(data)], ["Total", money(data.totalPaise)], ["Advance", money(data.advancePaise)]], action: { label: "Continue your booking", url: data.link }, note: "This link is private. Keep it to view or change your booking later."
  }),
  booking_request_vendor: data => render(`New booking request: ${data.customerName}, ${data.service}`, {
    preheader: `${whenOf(data)}`, heading: "New booking request",
    paragraphs: [`${data.customerName} (${data.customerEmail}) agreed to your terms for ${data.service}. Online payment is off, so please collect the ${money(data.advancePaise)} advance and record it to confirm the booking.`],
    rows: bookingRows(data), action: { label: "Open the booking", url: data.link }
  }),
  booking_confirmed_customer: data => render(`Confirmed: ${data.service} with ${data.businessName}`, {
    preheader: whenOf(data), heading: "Your booking is confirmed",
    paragraphs: [`Hi ${data.customerName}, you're booked. ${data.paidPaise > 0 ? `We received ${money(data.paidPaise)}.` : "No advance was needed."}`, `If you cancel: ${data.cancellation}`],
    rows: bookingRows(data), action: { label: "View booking, contract and receipt", url: data.link }
  }),
  booking_confirmed_vendor: data => render(`Booking confirmed: ${data.customerName}, ${data.service}`, {
    preheader: whenOf(data), heading: "A booking is confirmed",
    paragraphs: [`${data.customerName} (${data.customerEmail}) is booked for ${data.service}. ${data.paidPaise > 0 ? `${money(data.paidPaise)} is paid; ${money(data.totalPaise - data.paidPaise)} is due later.` : "No advance was required."}`],
    rows: bookingRows(data), action: { label: "Open the booking", url: data.link }
  }),
  booking_cancelled: data => {
    const who = data.cancelledBy === data.audience ? "You" : data.cancelledBy === "customer" ? data.customerName : data.businessName;
    const refund = data.refundPaise === 0 ? "No refund is due." : data.refundManual ? `${money(data.refundPaise)} is to be returned by ${data.businessName} directly, as it was paid to them directly.` : `${money(data.refundPaise)} is being refunded to the original payment method; it usually arrives in 5 to 7 working days.`;
    return render(`Cancelled: ${data.service} on ${whenOf(data)}`, { preheader: refund, heading: "Booking cancelled", paragraphs: [`${who} cancelled ${data.service}${data.audience === "vendor" ? ` booked by ${data.customerName}` : ` with ${data.businessName}`}.`, `Reason: ${data.reason}`, refund], rows: [["Service", data.service], ["Was booked for", whenOf(data)]], action: { label: "View the booking", url: data.link } });
  },
  refund_issued: data => render(`Refund of ${money(data.amountPaise)} from ${data.businessName}`, { preheader: "Usually 5 to 7 working days to reach you", heading: "Your refund is on its way", paragraphs: [`Hi ${data.customerName}, ${money(data.amountPaise)} for ${data.service} has been refunded to your original payment method.`, "Banks usually take 5 to 7 working days to show it."], action: { label: "View the booking", url: data.link } }),
  reminder_24h: data => render(`Tomorrow: ${data.service}${data.audience === "customer" ? ` with ${data.businessName}` : ` for ${data.customerName}`}`, {
    preheader: whenOf(data), heading: data.audience === "customer" ? "See you soon" : "Booking tomorrow",
    paragraphs: [data.audience === "customer" ? `Hi ${data.customerName}, a reminder of your booking with ${data.businessName}.` : `${data.customerName} (${data.customerEmail}) is booked for ${data.service}.`, data.totalPaise - data.paidPaise > 0 ? `${money(data.totalPaise - data.paidPaise)} is still due, as agreed.` : "Everything is paid."],
    rows: [["When", whenOf(data)], ["Where", data.place || "As agreed with the business"], ["Balance due", money(data.totalPaise - data.paidPaise)]], action: { label: "View the booking", url: data.link }
  }),
  payment_review: data => render(`[Bayana review] ${data.problem}`, { preheader: data.problem, heading: "Needs a look", paragraphs: [data.problem, ...(data.bookingId ? [`Booking ${data.bookingId}`] : [])], rows: data.lines.map((line, index): Row => [`${index + 1}`, line]), note: "Nothing was changed automatically except where the payment rules say so (late-payment refunds). Run pnpm.cmd payments:reconcile for detail." }),
  payment_recorded: data => render(data.confirmed ? `Confirmed: ${data.service} with ${data.businessName}` : `Payment recorded: ${money(data.amountPaise)}`, { preheader: `${money(data.amountPaise)} ${data.kind}`, heading: data.confirmed ? "Your booking is confirmed" : "Payment recorded", paragraphs: [`${data.businessName} recorded your ${data.kind} payment of ${money(data.amountPaise)}.${data.confirmed ? " Your booking is confirmed." : ""}`], rows: bookingRows(data), action: { label: "View booking and receipt", url: data.link } }),
  booking_rescheduled: data => render(`${data.days ? "New dates" : "New time"}: ${data.service} with ${data.businessName}`, { preheader: whenOf(data), heading: data.days ? "Your booking has new dates" : "Your booking has a new time", paragraphs: [`Hi ${data.customerName}, ${data.businessName} moved your booking. Your payments and agreed terms stay the same.`], rows: [["Service", data.service], [data.days ? "New dates" : "New time", whenOf(data)], ["Was", whenOf({ ...data, startsAt: data.previousStartsAt, endsAt: data.endsAt ? new Date(new Date(data.previousStartsAt).getTime() + new Date(data.endsAt).getTime() - new Date(data.startsAt).getTime()) : null })], ["Balance due", money(data.totalPaise - data.paidPaise)]], action: { label: "View the booking", url: data.link }, note: "If the new time does not work for you, reply to the business directly." })
};
export const renderTemplate = <K extends TemplateName>(name: K, data: TemplateData[K]) => templates[name](data);
