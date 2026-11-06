// One set of words for booking states, used by badges, headings, filters and timelines on both sides (customer and vendor).
// Display only: the database and the state machine keep the upper-case status names.

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  HELD: "Held",
  PENDING: "Awaiting advance",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  EXPIRED_PAID: "Paid after expiry"
};
/** "Awaiting advance" for PENDING; an unknown status is shown as it is. */
export const bookingStatusLabel = (status: string) => Object.hasOwn(BOOKING_STATUS_LABEL, status.toUpperCase()) ? BOOKING_STATUS_LABEL[status.toUpperCase()] : status;

/** A timeline entry, by the state the event moved the booking to. */
const EVENT_LABEL: Record<string, string> = {
  HELD: "Time held",
  PENDING: "Terms agreed, awaiting advance",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Hold expired, time released",
  EXPIRED_PAID: "Paid after the hold expired"
};
/** The system's own event reasons, said as a person would. A reason not listed here was typed by someone and is shown as it is. */
const REASON_LABEL: Record<string, string> = {
  "slot held": "Time held",
  // Bookings accepted before the reason said how the advance is paid.
  "terms accepted": "Terms agreed, awaiting advance",
  "terms accepted, nothing to pay": "Terms agreed",
  "terms accepted, advance to be arranged offline": "Terms agreed, advance to be arranged with the business",
  "terms accepted, advance to be paid online": "Terms agreed, awaiting online payment",
  "cancelled by customer": "Cancelled by the customer",
  "manual booking": "Added by the business",
  "manual booking, no online advance": "Added by the business, confirmed",
  "offline advance recorded": "Confirmed, advance recorded",
  "no advance required": "Confirmed, no advance needed",
  "late payment, slot re-claimed": "Confirmed, payment arrived late but the time was still free",
  "late payment, slot no longer free": "Paid after the hold expired; the time was taken, so the payment is refunded",
  "hold expired": "Hold expired, time released",
  "marked completed": "Completed"
};
/** Whether an event reason is one the system writes (so it is already said by bookingEventLabel). */
export const isSystemReason = (reason: string | null | undefined) => !reason || Object.hasOwn(REASON_LABEL, reason);
/** The sentence a timeline shows for an event: from its reason when the system wrote it, else from the state it reached. */
export const bookingEventLabel = (event: { to_status: string; reason?: string | null }) =>
  (event.reason && Object.hasOwn(REASON_LABEL, event.reason) ? REASON_LABEL[event.reason] : undefined) ?? EVENT_LABEL[event.to_status] ?? bookingStatusLabel(event.to_status);
