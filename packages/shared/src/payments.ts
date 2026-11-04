// How online payments are named to people. This build refuses live payments (PAYMENT_MODE=live never starts), so every
// online (Razorpay) payment is a test payment: it is labelled as one wherever it appears, on screens, emails and receipts.

/** The label of an online payment in lists and figures (dashboard, My bookings, the booking page). */
export const ONLINE_PAYMENT_LABEL = "Online (test)";
/** Shown wherever test checkout appears, before paying. */
export const TEST_PAYMENT_NOTICE = "Test payment: no real money will be charged.";
/** On emails and receipts of a test payment, after it happened. */
export const TEST_PAYMENT_DONE = "Test payment: no real money was charged.";
