-- Per-vendor switch for online (Razorpay) payments. Off for every vendor, existing and new: in this phase vendors are paid
-- directly and record the advance themselves. Online checkout shows only when PAYMENT_MODE=test AND this is on, and only an
-- admin can turn it on (admin console, or the SQL in docs/PAYMENTS_LOCAL.md).
-- Forward-only and in one transaction (the runner wraps each file). Additive: nothing is changed, dropped or renamed.

ALTER TABLE vendors ADD COLUMN online_payments boolean NOT NULL DEFAULT false;
